#!/usr/bin/env python3
"""Exact Android native symbols, cache format v2. Python stdlib + NDK LLVM only.

Never rebuild to obtain symbols for an existing APK. ELF build IDs and SHA-256
bind the cache pair and release archive to the binaries actually packaged.
Desktop sidecar artifacts and their source hash contract are intentionally untouched.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import zipfile

ABIS = ("arm64-v8a", "armeabi-v7a", "x86_64")
FORMAT = 2


def sha(data):
    return hashlib.sha256(data).hexdigest()


def elf(data):
    """Read GNU build ID and presence of DWARF without host-specific readelf."""
    if data[:4] != b"\x7fELF" or data[5] != 1 or data[4] not in (1, 2):
        raise ValueError("Expected a little-endian Android ELF")
    wide = data[4] == 2
    header = struct.unpack_from("<HHIQQQIHHHHHH" if wide else "<HHIIIIIHHHHHH", data, 16)
    offset, entry_size, count, strings_index = header[5], header[10], header[11], header[12]
    fmt = "<IIQQQQIIQQ" if wide else "<IIIIIIIIII"
    if count == 0 or count > 65535 or strings_index >= count or entry_size < struct.calcsize(fmt):
        raise ValueError("Invalid ELF section table")
    sections = [struct.unpack_from(fmt, data, offset + i * entry_size) for i in range(count)]
    names = sections[strings_index]
    strings = data[names[4]:names[4] + names[5]]
    build_id, debug = None, False
    for section in sections:
        name = strings[section[0]:].split(b"\0", 1)[0]
        debug |= name in (b".debug_info", b".zdebug_info")
        if section[1] != 7:  # SHT_NOTE
            continue
        pos, end = section[4], section[4] + section[5]
        while pos + 12 <= end:
            namesz, descsz, kind = struct.unpack_from("<III", data, pos)
            pos += 12
            owner = data[pos:pos + namesz].rstrip(b"\0")
            pos += (namesz + 3) & ~3
            desc = data[pos:pos + descsz]
            pos += (descsz + 3) & ~3
            if pos > end:
                raise ValueError("Invalid ELF note")
            if owner == b"GNU" and kind == 3:
                build_id = desc.hex()
    if not build_id:
        raise ValueError("Missing GNU build ID")
    return {"build_id": build_id, "debug": debug}


def llvm_tool(directory, name):
    return str(Path(directory) / (name + (".exe" if os.name == "nt" else "")))


def verify_core(root, allow_test_hooks=False):
    root = Path(root)
    manifest = json.loads((root / "symbols-manifest.json").read_text())
    if manifest["format"] != FORMAT or set(manifest["abis"]) != set(ABIS):
        raise ValueError("Unsupported or incomplete core symbol cache")
    for abi in ABIS:
        entry = manifest["abis"][abi]
        binary = (root / abi / "libclash.so").read_bytes()
        symbols = (root / "symbols" / abi / "libclash.so.debug").read_bytes()
        bin_info, sym_info = elf(binary), elf(symbols)
        if bin_info["build_id"] != sym_info["build_id"] or bin_info["build_id"] != entry["build_id"]:
            raise ValueError(f"Build ID mismatch: {abi}")
        if bin_info["debug"] or not sym_info["debug"]:
            raise ValueError(f"Expected stripped binary and unstripped symbols: {abi}")
        if sha(binary) != entry["binary_sha256"] or sha(symbols) != entry["symbols_sha256"]:
            raise ValueError(f"Checksum mismatch: {abi}")
        if not allow_test_hooks and b"debugCrash\0" in binary:
            raise ValueError(f"Test fault hook must not enter release/cache: {abi}")
    return manifest


def prepare_core(args):
    root = Path(args.output)
    manifest = {"format": FORMAT, "abis": {}}
    for abi in ABIS:
        source = Path(args.input) / abi / "libclash.so"
        symbols = root / "symbols" / abi / "libclash.so.debug"
        binary = root / abi / "libclash.so"
        symbols.parent.mkdir(parents=True, exist_ok=True)
        binary.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, symbols)
        subprocess.run([llvm_tool(args.llvm, "llvm-strip"), "--strip-unneeded", "-o", str(binary), str(source)], check=True)
        sym_data, bin_data = symbols.read_bytes(), binary.read_bytes()
        manifest["abis"][abi] = {"build_id": elf(sym_data)["build_id"],
            "binary_sha256": sha(bin_data), "symbols_sha256": sha(sym_data)}
    (root / "symbols-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    verify_core(root, allow_test_hooks=True)
    print(f"Verified native cache v{FORMAT}: {root}")


def archive(args):
    cache = Path(args.core_cache)
    verify_core(cache, allow_test_hooks=args.allow_test_hooks)
    apks = sorted(Path(args.apk_dir).glob("*.apk"))
    if not apks:
        raise ValueError("No APKs to match (build APKs first)")
    manifest = {"format": FORMAT, "version": args.version, "commit": args.commit,
                "apks": {}, "libraries": {}, "r8_mapping": "not-generated"}
    selected = {}
    candidates = list(Path(args.bridge_root).rglob("libbridge.so"))
    for apk in apks:
        manifest["apks"][apk.name] = sha(apk.read_bytes())
        with zipfile.ZipFile(apk) as z:
            for name in z.namelist():
                match = re.fullmatch(r"lib/([^/]+)/(libclash|libbridge)\.so", name)
                if not match:
                    continue
                abi, lib = match.groups()
                data = z.read(name)
                info = elf(data)
                if info["debug"]:
                    raise ValueError(f"APK contains unstripped DWARF: {name}")
                key = f"{abi}/{lib}.so"
                symbol = cache / "symbols" / abi / "libclash.so.debug" if lib == "libclash" else None
                if symbol is None:
                    for candidate in candidates:
                        if abi not in candidate.parts:
                            continue
                        candidate_info = elf(candidate.read_bytes())
                        if candidate_info["debug"] and candidate_info["build_id"] == info["build_id"]:
                            symbol = candidate
                            break
                if symbol is None or elf(symbol.read_bytes())["build_id"] != info["build_id"]:
                    raise ValueError(f"No matching original symbols for {key} ({info['build_id']})")
                entry = {"build_id": info["build_id"], "binary_sha256": sha(data),
                         "symbols_sha256": sha(symbol.read_bytes()),
                         "path": f"symbols/{abi}/{info['build_id']}/{lib}.so.debug"}
                if key in manifest["libraries"] and entry != manifest["libraries"][key]:
                    raise ValueError(f"APK splits disagree for {key}")
                manifest["libraries"][key] = entry
                selected[entry["path"]] = symbol
    expected = {f"{abi}/{lib}.so" for abi in ABIS for lib in ("libclash", "libbridge")}
    if set(manifest["libraries"]) != expected:
        raise ValueError("Release archive requires both libraries for all three ABIs")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    mapping = Path(args.mapping) if args.mapping else None
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as z:
        for name, source in selected.items():
            z.write(source, name)
        if mapping and mapping.is_file():
            manifest["r8_mapping"] = sha(mapping.read_bytes())
            z.write(mapping, "mapping.txt")
        metadata = Path(args.apk_dir) / "output-metadata.json"
        if metadata.is_file():
            z.write(metadata, "apk-output-metadata.json")
        z.writestr("manifest.json", json.dumps(manifest, indent=2) + "\n")
    print(f"Archived {len(selected)} exact native symbol files: {output}")


def symbolize(args):
    if not re.fullmatch(r"[a-fA-F0-9]+", args.build_id):
        raise ValueError("Invalid build ID")
    pc = int(args.pc, 16)
    with zipfile.ZipFile(args.archive) as z, tempfile.TemporaryDirectory(prefix="cheezy-symbols-") as tmp:
        manifest = json.loads(z.read("manifest.json"))
        matches = [entry for key, entry in manifest["libraries"].items()
                   if key.startswith(args.abi + "/") and entry["build_id"] == args.build_id.lower()]
        if len(matches) != 1:
            raise ValueError("No unique ABI/build ID match in this archive")
        entry = matches[0]
        data = z.read(entry["path"])
        if sha(data) != entry["symbols_sha256"] or elf(data)["build_id"] != args.build_id.lower():
            raise ValueError("Corrupt symbols")
        target = Path(tmp) / "native.so.debug"
        target.write_bytes(data)
        subprocess.run([llvm_tool(args.llvm, "llvm-symbolizer"), "--obj=" + str(target),
                        "--relative-address", "--demangle", "--inlines", hex(pc)], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare-core")
    for name in ("input", "output", "llvm"):
        prepare.add_argument("--" + name, required=True)
    verify = commands.add_parser("verify-core")
    verify.add_argument("--input", required=True)
    pack = commands.add_parser("archive")
    pack.add_argument("--apk-dir", required=True)
    pack.add_argument("--core-cache", default="core/build/generatedJniLibs")
    pack.add_argument("--bridge-root", default="core/build/intermediates/cxx")
    pack.add_argument("--mapping")
    pack.add_argument("--version", required=True)
    pack.add_argument("--commit", default="local")
    pack.add_argument("--output", required=True)
    pack.add_argument("--allow-test-hooks", action="store_true", help="Debug/test archive only")
    symbol = commands.add_parser("symbolize")
    for name in ("archive", "abi", "build-id", "pc", "llvm"):
        symbol.add_argument("--" + name, required=True)
    args = parser.parse_args()
    if args.command == "prepare-core":
        prepare_core(args)
    elif args.command == "verify-core":
        verify_core(args.input)
        print("Core cache pairs verified")
    elif args.command == "archive":
        archive(args)
    else:
        symbolize(args)


if __name__ == "__main__":
    main()
