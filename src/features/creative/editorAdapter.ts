import {
  CaptureUpdateAction,
  getCommonBounds,
  newElementWith,
} from "@excalidraw/excalidraw";
import { generateNKeysBetween } from "fractional-indexing";
import type {
  ExcalidrawImperativeAPI,
  BinaryFileData,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { isPaper, moveScene } from "./composer";
import { Composer } from "./composer";
import { palettes, readableInk } from "./palettes";
import { assetById, svgDataUrl } from "./registry";
import type { CreativeScene, Palette } from "./types";
export type Placement = "center" | "beside" | "replace";
export type ArrangeAction =
  | "front"
  | "back"
  | "forward"
  | "backward"
  | "group"
  | "ungroup"
  | "duplicate"
  | "lock"
  | "unlock"
  | "flip"
  | "rotate";
export function selectedElements(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElements();
  const state = api.getAppState();
  const ids = new Set(
    Object.keys(state.selectedElementIds).filter(
      (id) => state.selectedElementIds[id],
    ),
  );
  for (const element of elements)
    if (element.groupIds.some((id) => state.selectedGroupIds[id]))
      ids.add(element.id);
  for (const element of elements)
    if (
      element.type === "text" &&
      element.containerId &&
      ids.has(element.containerId)
    )
      ids.add(element.id);
  return elements.filter((e) => ids.has(e.id) && !isPaper(e));
}
export function commitElements(
  api: ExcalidrawImperativeAPI,
  elements: readonly ExcalidrawElement[],
  selected?: readonly ExcalidrawElement[],
) {
  api.updateScene({
    elements,
    appState: selected
      ? {
          selectedElementIds: Object.fromEntries(
            selected.map((e) => [e.id, true]),
          ),
          selectedGroupIds: {},
        }
      : undefined,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
export function findPhotoSlot(api: ExcalidrawImperativeAPI) {
  const selected = selectedElements(api);
  const groups = new Set(selected.flatMap((e) => e.groupIds));
  return api
    .getSceneElements()
    .find(
      (e) =>
        e.customData?.photoSlot &&
        (selected.some((s) => s.id === e.id) ||
          e.groupIds.some((id) => groups.has(id))),
    );
}
export function fillPhotoSlot(
  api: ExcalidrawImperativeAPI,
  photo: Awaited<ReturnType<typeof readPhoto>>,
  slotId: string,
) {
  const slot = api
    .getSceneElements()
    .find((e) => e.id === slotId && e.customData?.photoSlot);
  if (!slot) throw new Error("Select an empty photo frame first.");
  const c = new Composer(palettes[0]);
  const scale = Math.min(slot.width / photo.width, slot.height / photo.height);
  c.image(
    photo.file,
    slot.x + (slot.width - photo.width * scale) / 2,
    slot.y + (slot.height - photo.height * scale) / 2,
    photo.width * scale,
    photo.height * scale,
    [...slot.groupIds],
  );
  const scene = c.finish();
  scene.elements = scene.elements.map((e) =>
    newElementWith(e, { angle: slot.angle }),
  );
  const replaced = new Set([
    slot.id,
    ...(slot.boundElements?.map((e) => e.id) ?? []),
  ]);
  api.addFiles(Object.values(scene.files));
  commitElements(
    api,
    [
      ...api
        .getSceneElementsIncludingDeleted()
        .map((e) =>
          replaced.has(e.id) ? newElementWith(e, { isDeleted: true }) : e,
        ),
      ...scene.elements,
    ],
    scene.elements,
  );
}
export function insertScene(
  api: ExcalidrawImperativeAPI,
  scene: CreativeScene,
  placement: Placement = "center",
  offset = 0,
) {
  const all = api.getSceneElementsIncludingDeleted();
  const content = all.filter((e) => !e.isDeleted && !isPaper(e));
  const [x1, y1, x2, y2] = getCommonBounds(scene.elements);
  let x = 0,
    y = 0;
  if (placement === "beside" && content.length) {
    const bounds = getCommonBounds(content);
    x = bounds[2] + 90 - x1;
    y = bounds[1] - y1;
  } else if (placement === "center") {
    const state = api.getAppState();
    x =
      state.width / (2 * state.zoom.value) -
      state.scrollX -
      (x1 + x2) / 2 +
      offset;
    y =
      state.height / (2 * state.zoom.value) -
      state.scrollY -
      (y1 + y2) / 2 +
      offset;
  }
  const moved = moveScene(scene, x, y);
  api.addFiles(Object.values(moved.files));
  const base =
    placement === "replace"
      ? all.map((e) =>
          isPaper(e) || e.isDeleted
            ? e
            : newElementWith(e, { isDeleted: true }),
        )
      : all;
  commitElements(
    api,
    [...base, ...moved.elements],
    placement === "center" ? moved.elements : [],
  );
  api.setActiveTool({ type: "selection" });
  if (placement !== "center")
    api.scrollToContent(moved.elements, {
      fitToViewport: true,
      viewportZoomFactor: 0.8,
    });
}
export function arrange(api: ExcalidrawImperativeAPI, action: ArrangeAction) {
  const all = [...api.getSceneElementsIncludingDeleted()];
  const selected = selectedElements(api);
  const ids = new Set(selected.map((e) => e.id));
  if (action === "unlock") {
    commitElements(
      api,
      all.map((e) =>
        e.locked && !isPaper(e) && e.customData?.lotepadCreative
          ? newElementWith(e, { locked: false })
          : e,
      ),
    );
    return;
  }
  if (!selected.length) throw new Error("Select an item on the canvas first.");
  if (action === "flip" && !selected.some((e) => e.type === "image"))
    throw new Error("Select an image to flip.");
  if (action === "duplicate") {
    const idMap = new Map(selected.map((e) => [e.id, crypto.randomUUID()]));
    const groupMap = new Map(
      selected
        .flatMap((e) => e.groupIds)
        .map((id) => [id, crypto.randomUUID()]),
    );
    const copies = selected.map((e) => {
      const copy = { ...e, id: idMap.get(e.id)! };
      const common = {
        x: e.x + 26,
        y: e.y + 26,
        locked: false,
        groupIds: e.groupIds.map((id) => groupMap.get(id)!),
        boundElements:
          e.boundElements
            ?.filter((b) => idMap.has(b.id))
            .map((b) => ({ ...b, id: idMap.get(b.id)! })) ?? null,
      };
      if (copy.type === "text")
        return newElementWith(copy, {
          ...common,
          containerId: copy.containerId
            ? (idMap.get(copy.containerId) ?? null)
            : null,
        });
      if (copy.type === "arrow")
        return newElementWith(copy, {
          ...common,
          startBinding:
            copy.startBinding && idMap.has(copy.startBinding.elementId)
              ? {
                  ...copy.startBinding,
                  elementId: idMap.get(copy.startBinding.elementId)!,
                }
              : null,
          endBinding:
            copy.endBinding && idMap.has(copy.endBinding.elementId)
              ? {
                  ...copy.endBinding,
                  elementId: idMap.get(copy.endBinding.elementId)!,
                }
              : null,
        });
      return newElementWith(copy, common);
    });
    commitElements(api, [...all, ...copies], copies);
    return;
  }
  if (["front", "back", "forward", "backward"].includes(action)) {
    const backgrounds = all.filter(isPaper),
      others = all.filter((e) => !isPaper(e));
    let ordered = others;
    if (action === "front")
      ordered = [
        ...others.filter((e) => !ids.has(e.id)),
        ...others.filter((e) => ids.has(e.id)),
      ];
    if (action === "back")
      ordered = [
        ...others.filter((e) => ids.has(e.id)),
        ...others.filter((e) => !ids.has(e.id)),
      ];
    if (action === "forward") {
      ordered = [...others];
      for (let i = ordered.length - 2; i >= 0; i--)
        if (ids.has(ordered[i].id) && !ids.has(ordered[i + 1].id))
          [ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]];
    }
    if (action === "backward") {
      ordered = [...others];
      for (let i = 1; i < ordered.length; i++)
        if (ids.has(ordered[i].id) && !ids.has(ordered[i - 1].id))
          [ordered[i], ordered[i - 1]] = [ordered[i - 1], ordered[i]];
    }
    const order = [...backgrounds, ...ordered];
    const indexes = generateNKeysBetween(null, null, order.length);
    commitElements(
      api,
      order.map((e, i) =>
        newElementWith(e, {
          index: indexes[i] as NonNullable<ExcalidrawElement["index"]>,
        }),
      ),
    );
    return;
  }
  const groupId = crypto.randomUUID();
  const groups = new Set(selected.flatMap((e) => e.groupIds));
  const bounds = getCommonBounds(selected);
  const cx = (bounds[0] + bounds[2]) / 2,
    cy = (bounds[1] + bounds[3]) / 2;
  const angle = Math.PI / 36;
  commitElements(
    api,
    all.map((e) => {
      if (!ids.has(e.id)) return e;
      if (action === "group")
        return newElementWith(e, { groupIds: [...e.groupIds, groupId] });
      if (action === "ungroup")
        return newElementWith(e, {
          groupIds: e.groupIds.filter((id) => !groups.has(id)),
        });
      if (action === "lock") return newElementWith(e, { locked: true });
      if (action === "flip") {
        if (e.type !== "image") return e;
        return newElementWith(e, { scale: [-e.scale[0], e.scale[1]] });
      }
      if (action === "rotate") {
        const x = e.x + e.width / 2 - cx,
          y = e.y + e.height / 2 - cy;
        return newElementWith(e, {
          x: cx + x * Math.cos(angle) - y * Math.sin(angle) - e.width / 2,
          y: cy + x * Math.sin(angle) + y * Math.cos(angle) - e.height / 2,
          angle: e.angle + angle,
        });
      }
      return e;
    }),
    action === "lock" ? [] : undefined,
  );
}
export function recolorSelection(
  api: ExcalidrawImperativeAPI,
  palette: Palette,
  color: string,
) {
  const selected = selectedElements(api);
  if (!selected.length) throw new Error("Select an item first.");
  const ids = new Set(selected.map((e) => e.id));
  const files: BinaryFileData[] = [];
  const cardGroups = new Set(
    selected
      .filter((e) => e.customData?.creativeKind === "card")
      .flatMap((e) => e.groupIds),
  );
  const elements = api.getSceneElementsIncludingDeleted().map((e) => {
    if (!ids.has(e.id)) return e;
    if (e.type === "image") {
      const asset = assetById(String(e.customData?.creativeAssetId ?? ""));
      if (!asset?.svg) return e;
      const id = crypto.randomUUID() as BinaryFileData["id"];
      files.push({
        id,
        dataURL: svgDataUrl(
          asset.svg(palette, color),
        ) as BinaryFileData["dataURL"],
        mimeType: "image/svg+xml",
        created: Date.now(),
      });
      return newElementWith(e, {
        fileId: id,
        customData: { ...e.customData, creativeColor: color },
      });
    }
    if (e.type === "text" && e.containerId && ids.has(e.containerId))
      return newElementWith(e, {
        strokeColor: readableInk(color, palette.ink),
      });
    if (e.type === "line" && e.groupIds.some((id) => cardGroups.has(id)))
      return newElementWith(e, {
        strokeColor: readableInk(color, palette.ink),
      });
    if (
      e.type === "text" ||
      e.type === "arrow" ||
      e.type === "line" ||
      e.type === "freedraw"
    )
      return newElementWith(e, { strokeColor: color });
    return newElementWith(e, { backgroundColor: color, fillStyle: "solid" });
  });
  api.addFiles(files);
  commitElements(api, elements);
}
export async function readPhoto(
  file: File,
): Promise<{ file: BinaryFileData; width: number; height: number }> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Choose an image smaller than 15 MB.");
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 50000000)
      throw new Error("Choose an image below 50 megapixels.");
    const scale = Math.min(1, 4096 / Math.max(image.width, image.height));
    let dataURL: string;
    if (scale < 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare this photo.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      dataURL = canvas.toDataURL(file.type, 0.92);
    } else
      dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read this photo."));
        reader.readAsDataURL(file);
      });
    const id = crypto.randomUUID() as BinaryFileData["id"];
    return {
      file: {
        id,
        dataURL: dataURL as BinaryFileData["dataURL"],
        mimeType: file.type as BinaryFileData["mimeType"],
        created: Date.now(),
      },
      width: Math.round(image.width * scale),
      height: Math.round(image.height * scale),
    };
  } finally {
    image.close();
  }
}
