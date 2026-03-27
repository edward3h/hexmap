<?php
// backend/src/hex.php
// Hex grid utilities for odd-q offset coordinates.

declare(strict_types=1);

/**
 * Returns true if the two tiles at (col1,row1) and (col2,row2) are adjacent
 * in an odd-q offset hex grid (odd columns shifted up / lower Z in 3D).
 *
 * Neighbour offsets derived from tileCoordsTo3d in src/hexUtil.ts:
 *   even col: adjacent at dc=±1 with dr=0 or dr=+1, plus same col dr=±1
 *   odd  col: adjacent at dc=±1 with dr=0 or dr=-1, plus same col dr=±1
 */
function areHexesAdjacent(int $col1, int $row1, int $col2, int $row2): bool
{
    $neighbours = ($col1 % 2 === 0)
        ? [[1, 0], [1, 1], [-1, 0], [-1, 1], [0, -1], [0, 1]]   // even col
        : [[1, 0], [1, -1], [-1, 0], [-1, -1], [0, -1], [0, 1]]; // odd col

    foreach ($neighbours as [$dc, $dr]) {
        if ($col1 + $dc === $col2 && $row1 + $dr === $row2) {
            return true;
        }
    }
    return false;
}
