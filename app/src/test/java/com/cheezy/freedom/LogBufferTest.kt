package com.cheezy.freedom

import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateListOf
import org.junit.Assert.*
import org.junit.Test

class LogBufferTest {
    @Test fun `derived filter advances when buffer size stays constant`() {
        val buffer = mutableStateListOf<Int>().apply { addAll(0 until 1000) }
        val filtered = derivedStateOf { buffer.filter { it % 2 == 0 } }
        assertEquals(998, filtered.value.last())
        val paused = filtered.value.toList()
        repeat(4) { buffer.add(1000 + it); buffer.removeAt(0) }
        assertEquals(1000, buffer.size)
        assertEquals(1002, filtered.value.last())
        assertEquals(998, paused.last())
    }
}
