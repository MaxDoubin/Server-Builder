/**
 * Make every table in a post reachable on a phone.
 *
 * `marked` renders a GFM table as a bare `<table>`, and a bare table does not
 * wrap: it is as wide as its widest row needs and it stays that wide. On a
 * 375px viewport the comparison tables in this archive run to about 406px,
 * and because the article column sits inside an `overflow-hidden` ancestor
 * the surplus is not scrolled to, it is clipped. The right hand column of
 * thirteen posts was unreachable on a phone, with no horizontal scrollbar
 * anywhere on the page to suggest anything was missing.
 *
 * That is worse than an obvious layout break. A page that visibly overflows
 * gets reported; a page that quietly drops a column reads as complete.
 *
 * So each table goes inside its own scroller. The wrapper takes the overflow
 * rather than the page, which is the rule the rest of the site already
 * follows for wide content, and it is focusable so the far column can be
 * reached by keyboard as well as by touch: a scroll region only a pointer
 * can reach is the same problem wearing different clothes.
 */
import { Renderer, type MarkedExtension } from "marked";

export const SCROLLABLE_TABLE_CLASS = "post-table-scroll";

/*
  Delegate to marked's own table renderer and wrap what it returns.

  Rebuilding the table here instead was the first attempt and it was wrong:
  the renderer receives a token whose cells hold inline tokens, so reading
  `cell.text` yields the raw markdown and any bold, code span or link inside
  a cell renders as literal asterisks and backticks. Calling the default with
  the live `this` keeps its parser, and this file stays correct through a
  marked upgrade because it does not restate anything marked already knows.
*/
const base = new Renderer();

export const scrollableTables: MarkedExtension = {
  renderer: {
    table(token: Parameters<Renderer["table"]>[0]) {
      const html = base.table.call(this as unknown as Renderer, token);
      return (
        `<div class="${SCROLLABLE_TABLE_CLASS}" tabindex="0" role="region"` +
        ` aria-label="Table, scrollable">${html}</div>\n`
      );
    },
  },
};
