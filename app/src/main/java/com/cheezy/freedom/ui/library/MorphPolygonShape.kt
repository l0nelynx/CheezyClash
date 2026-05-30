package com.cheezy.freedom.ui.library

import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.graphics.shapes.Morph
import androidx.graphics.shapes.toPath

class MorphPolygonShape(
    private val morph: Morph,
    private val percentage: Float,
) : Shape {
    private val matrix = Matrix()

    override fun createOutline(
        size: Size,
        layoutDirection: LayoutDirection,
        density: Density
    ): Outline {
        if (size.width <= 0f || size.height <= 0f) return Outline.Generic(androidx.compose.ui.graphics.Path())

        // 1. Get path for the current progress
        val path = morph.toPath(progress = percentage).asComposePath()
        
        // 2. Determine bounds
        val bounds = path.getBounds()
        if (bounds.width <= 0f || bounds.height <= 0f) return Outline.Generic(path)
        
        // 3. Calculate scale (fit into container size)
        val scale = minOf(size.width / bounds.width, size.height / bounds.height)
        
        // 4. Center the shape
        // Move the geometric center of the shape to the center of the container
        val centerX = bounds.left + bounds.width / 2f
        val centerY = bounds.top + bounds.height / 2f
        
        matrix.reset()
        // First move the shape's center to (0,0), scale, then move to the target size's center
        matrix.translate(size.width / 2f, size.height / 2f)
        matrix.scale(scale, scale)
        matrix.translate(-centerX, -centerY)
        
        path.transform(matrix)
        
        return Outline.Generic(path)
    }
}
