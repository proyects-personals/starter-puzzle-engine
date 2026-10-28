'use strict';

/**
 * Motor de rompecabezas compartido (versión navegador).
 * Calcula la cuadrícula y posiciones de dispersión de piezas.
 */
const PuzzleEngine = (() => {
  function gridDimensions(total, imageWidth, imageHeight) {
    const imageRatio = imageWidth / Math.max(imageHeight, 1);
    const candidates = [];

    for (let columns = 1; columns <= total; columns += 1) {
      if (total % columns !== 0) {
        continue;
      }

      const rows = total / columns;
      const tileRatio = imageWidth / columns / (imageHeight / rows);
      candidates.push([Math.abs(Math.log(Math.max(tileRatio, 1e-9))), columns, rows]);
    }

    if (candidates.length === 0) {
      return [total, 1];
    }

    candidates.sort((a, b) => a[0] - b[0]);
    let [, columns, rows] = candidates[0];

    if (imageRatio < 0.75 && columns > rows) {
      [columns, rows] = [rows, columns];
    }

    return [columns, rows];
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function weightedChoice(entries, weights) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    if (total <= 0) {
      return entries[0];
    }

    let ticket = Math.random() * total;

    for (let index = 0; index < entries.length; index += 1) {
      ticket -= weights[index];

      if (ticket <= 0) {
        return entries[index];
      }
    }

    return entries[entries.length - 1];
  }

  function scatterPosition(areaWidth, areaHeight, board, tile) {
    const margin = 12;
    const leftWidth = Math.max(board.x - margin - tile.width, 0);
    const rightWidth = Math.max(areaWidth - board.x - board.width - margin - tile.width, 0);
    const topHeight = Math.max(board.y - margin - tile.height, 0);
    const bottomHeight = Math.max(areaHeight - board.y - board.height - margin - tile.height, 0);

    const totalWeight = leftWidth * areaHeight + rightWidth * areaHeight
      + areaWidth * topHeight + areaWidth * bottomHeight;

    if (totalWeight <= 0) {
      // Sin espacio en los bordes: reparte sobre toda el área con jitter
      const maxX = Math.max(areaWidth - tile.width, 0);
      const maxY = Math.max(areaHeight - tile.height, 0);
      return [
        clamp(Math.round(Math.random() * maxX), 0, maxX),
        clamp(Math.round(Math.random() * maxY), 0, maxY),
      ];
    }

    const zone = weightedChoice(
      ['left', 'right', 'top', 'bottom'],
      [leftWidth * areaHeight, rightWidth * areaHeight, areaWidth * topHeight, areaWidth * bottomHeight],
    );

    let x;
    let y;

    if (zone === 'left') {
      x = Math.random() * leftWidth + margin / 2;
      y = Math.random() * Math.max(areaHeight - tile.height, 0);
    } else if (zone === 'right') {
      x = board.x + board.width + margin + Math.random() * rightWidth;
      y = Math.random() * Math.max(areaHeight - tile.height, 0);
    } else if (zone === 'top') {
      x = Math.random() * Math.max(areaWidth - tile.width, 0);
      y = Math.random() * topHeight + margin / 2;
    } else {
      x = Math.random() * Math.max(areaWidth - tile.width, 0);
      y = board.y + board.height + margin + Math.random() * bottomHeight;
    }

    return [
      clamp(Math.round(x), 0, Math.max(areaWidth - tile.width, 0)),
      clamp(Math.round(y), 0, Math.max(areaHeight - tile.height, 0)),
    ];
  }

  return { gridDimensions, scatterPosition, clamp, weightedChoice };
})();
