/**
 * The one place that decides whether a label is scaled by the camera.
 *
 * Two gates need this answer and they must not drift apart, because the
 * thing they are both guarding is a size, and a size that one gate exempts
 * and the other does not is a size nobody is checking.
 *
 * drei's <Html> mounts ordinary DOM at a 3D position. On its own that DOM
 * is screen space: it is placed by the projection and then drawn at the
 * size the stylesheet says, exactly like a panel in a corner. It is only
 * when the element carries distanceFactor that its size follows the camera,
 * and that is the case where raising the type does not make it readable,
 * because the reader's control over apparent size is the zoom.
 *
 * So the test is distanceFactor on the opening tag, not the folder the file
 * happens to sit in. The tag is frequently written across several lines
 * with the attribute on one of them, so this walks to the tag's end rather
 * than reading a line.
 */

/** Character ranges of every <Html distanceFactor ...> ... </Html> body. */
export function cameraScaledRanges(source) {
  const ranges = [];
  const OPEN = /<Html\b/g;
  let match;
  while ((match = OPEN.exec(source)) !== null) {
    const start = match.index;
    /* Walk to the tag's closing >, ignoring any inside a JSX expression. */
    let i = start, depth = 0, end = -1;
    while (i < source.length) {
      const ch = source[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) { end = i; break; }
      i += 1;
    }
    if (end === -1) break;
    const tag = source.slice(start, end + 1);
    if (!/\bdistanceFactor\b/.test(tag)) continue;
    if (/\/>$/.test(tag.trim())) continue;

    /* Find this tag's own </Html>, stepping over nested ones. */
    let nest = 1, cursor = end + 1;
    while (cursor < source.length && nest > 0) {
      const nextOpen = source.indexOf("<Html", cursor);
      const nextClose = source.indexOf("</Html>", cursor);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) { nest += 1; cursor = nextOpen + 5; }
      else { nest -= 1; cursor = nextClose + 7; }
    }
    ranges.push([end + 1, cursor]);
  }
  return ranges;
}

export function isCameraScaled(ranges, index) {
  return ranges.some(([a, b]) => index >= a && index < b);
}
