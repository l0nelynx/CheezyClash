#include "bridge_helper.h"

uint64_t down_scale_traffic(uint64_t value) {
    if (value > 1042ull * 1024ull * 1024ull)
        return ((value * 100ull / 1024ull / 1024ull / 1024ull) & 0x3FFFFFFFu) | (3u << 30u);
    if (value > 1024ull * 1024ull)
        return ((value * 100ull / 1024ull / 1024ull) & 0x3FFFFFFFu) | (2u << 30u);
    if (value > 1024ull)
        return ((value * 100ull / 1024ull) & 0x3FFFFFFFu) | (1u << 30u);
    return value & 0x3FFFFFFFu;
}
