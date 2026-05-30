package com.cheezy.freedom.ui.library

import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.graphics.shapes.Morph
import androidx.graphics.shapes.toPath

class RotatingMorphPolygonShape(
    private val morph: Morph,
    private val percentage: Float,
    private val rotation: Float
) : Shape {
    override fun createOutline(
        size: Size,
        layoutDirection: LayoutDirection,
        density: Density
    ): Outline {
        val matrix = Matrix()
        matrix.scale(size.width / 2f, size.height / 2f)
        matrix.translate(1f, 1f)

        val path = morph.toPath(progress = percentage).asComposePath()
        path.transform(matrix)

        // Rotate the already scaled path around the container's center
        val androidPath = path.asAndroidPath()
        val rotationMatrix = android.graphics.Matrix()
        rotationMatrix.postRotate(
            rotation,
            size.width / 2f,   // pivot X = container center
            size.height / 2f   // pivot Y = container center
        )
        androidPath.transform(rotationMatrix)

        return Outline.Generic(androidPath.asComposePath())
    }
}