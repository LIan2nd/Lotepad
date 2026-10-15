import { useEffect, useState } from "react";
import { exportToSvg } from "@excalidraw/excalidraw";
import { Loader2 } from "lucide-react";
import { svgDataUrl } from "./registry";
import type { CreativeScene } from "./types";
import { errorMessage } from "../../components/ui";
export function ScenePreview({
  scene,
  label = "Composition preview",
  background = "#fffaf4",
}: {
  scene: CreativeScene;
  label?: string;
  background?: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setUrl("");
    setError("");
    void exportToSvg({
      elements: scene.elements,
      files: scene.files,
      appState: {
        exportBackground: true,
        viewBackgroundColor: background,
        exportWithDarkMode: false,
      },
      exportPadding: 25,
    })
      .then((svg: SVGSVGElement) => {
        if (live) setUrl(svgDataUrl(svg.outerHTML));
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [scene, background]);
  return (
    <div className="scene-preview" aria-busy={!url && !error}>
      {url ? (
        <img src={url} alt={label} />
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : (
        <Loader2 size={23} className="spin" />
      )}
    </div>
  );
}
