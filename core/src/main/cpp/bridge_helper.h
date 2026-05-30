#pragma once

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* TRACE_METHOD — отключённый трассировщик из CMFA. Пустой макрос. */
#define TRACE_METHOD()

/* Упаковка пары upload/download (uint64_t) в один jlong: 2 бита тип + 30 бит данные. */
uint64_t down_scale_traffic(uint64_t value);

/* Возвращает malloc'нутую копию C-строки или NULL для NULL/пустых. */
static inline char *make_String(const char *src) {
    if (src == NULL) {
        return NULL;
    }
    size_t n = strlen(src);
    char *dst = (char *) malloc(n + 1);
    if (dst == NULL) {
        return NULL;
    }
    memcpy(dst, src, n + 1);
    return dst;
}
