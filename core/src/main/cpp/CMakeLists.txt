cmake_minimum_required(VERSION 3.22.1)

project(bridge C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Release flags: оптимизация по размеру/скорости + удаление debug-инфо.
if (NOT "${CMAKE_BUILD_TYPE}" STREQUAL "Debug")
    add_compile_options(-O3 -fno-exceptions -fvisibility=hidden)
    add_link_options(-Wl,--gc-sections -Wl,--strip-all)
endif ()

include_directories(${CMAKE_CURRENT_SOURCE_DIR}/includes)

# libclash.so ищем в порядке приоритета:
#   1) Go-сборка локально: build/intermediates/golang/<ABI>/libclash.so
#   2) Go-output restored из CI кеша: build/generatedJniLibs/<ABI>/libclash.so
#   3) prebuilt в ../jniLibs/<ABI>/libclash.so (legacy fallback, сейчас пуст)
# Прицепляется к buildGoClash<Abi>-таске через dependsOn в build.gradle.kts.
set(LIBCLASH_GO    ${CMAKE_CURRENT_SOURCE_DIR}/../../../build/intermediates/golang/${ANDROID_ABI}/libclash.so)
set(LIBCLASH_CACHE ${CMAKE_CURRENT_SOURCE_DIR}/../../../build/generatedJniLibs/${ANDROID_ABI}/libclash.so)
set(LIBCLASH_PRE   ${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libclash.so)

if (EXISTS ${LIBCLASH_GO})
    set(LIBCLASH_PATH ${LIBCLASH_GO})
    message(STATUS "Using Go-built libclash: ${LIBCLASH_PATH}")
elseif (EXISTS ${LIBCLASH_CACHE})
    set(LIBCLASH_PATH ${LIBCLASH_CACHE})
    message(STATUS "Using cached libclash (CI restore): ${LIBCLASH_PATH}")
elseif (EXISTS ${LIBCLASH_PRE})
    set(LIBCLASH_PATH ${LIBCLASH_PRE})
    message(STATUS "Using prebuilt libclash: ${LIBCLASH_PATH}")
else ()
    message(FATAL_ERROR "libclash.so for ABI ${ANDROID_ABI} not found (no Go output, no cache, no prebuilt)")
endif ()

set(LIBCLASH_DIR ${LIBCLASH_PATH} DIRECTORY)
get_filename_component(LIBCLASH_DIR ${LIBCLASH_PATH} DIRECTORY)

add_library(clash SHARED IMPORTED)
set_target_properties(clash PROPERTIES
        IMPORTED_LOCATION ${LIBCLASH_PATH}
        # КРИТИЧНО: без этого CMake пишет абсолютный путь хоста в DT_NEEDED libbridge,
        # и на устройстве dlopen libbridge падает с "library not found".
        # IMPORTED_NO_SONAME заставляет линкер использовать "-lclash" → DT_NEEDED="libclash.so".
        IMPORTED_NO_SONAME TRUE)

add_library(bridge SHARED
        main.c
        jni_helper.c
        bridge_helper.c)

target_link_libraries(bridge
        clash
        log)
