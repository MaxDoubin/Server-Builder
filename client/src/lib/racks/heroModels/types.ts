/**
 * The contract a hero model's part table builds to.
 *
 * A model is a pile of named meshes; this is what turns a name into
 * something worth showing when someone clicks it.
 */

import type { RackDevice } from "@/lib/rackTypes";

export interface HeroPart {
  /** Top level node group in the GLB. */
  group: string;
  device: RackDevice;
}

export interface HeroModel {
  /** Served from client/public/models. */
  url: string;
  parts: HeroPart[];
  /** Structure and cabling: crawled and drawn, never selectable. */
  scenery: Set<string>;
  /** One line under the view, describing what the model is. */
  note: string;
}
