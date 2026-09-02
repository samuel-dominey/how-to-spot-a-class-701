"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";

type PageImage = { page: number; dataUrl: string };
type Size = { w: number; h: number };

export default function Home() {
  const [pages, setPages] = useState<PageImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [pagePx, setPagePx] = useState<Size | null>(null);

  const renderIdRef = useRef(0);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Worker from /public
  useEffect(() => {
    GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  }, []);

  // Decide portrait vs spread (tweak breakpoint if you want)
  const isPortrait = useMemo(() => {
    // If the screen is narrow, use single page.
    return vp.w < 900;
  }, [vp.w]);

  useEffect(() => {
    if (!vp.w || !vp.h) return;

    const myRenderId = ++renderIdRef.current;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        setPages([]);
        setPagePx(null);

        const task = getDocument({ url: "/book.pdf" });
        const pdf: PDFDocumentProxy = await task.promise;

        const first = await pdf.getPage(1);
        const baseVp = first.getViewport({ scale: 1 });

        const padding = 24;
        const maxW = Math.max(320, vp.w - padding * 2);
        const maxH = Math.max(420, vp.h - padding * 2);

        // If we’re in spread mode, we must fit TWO pages across.
        // PageFlip will display two pages side-by-side in landscape mode,
        // so the “book” width is ~2 * pageWidth.
        const spreadFactor = isPortrait ? 1 : 2;

        const fitScale = Math.min(
          maxW / (baseVp.width * spreadFactor),
          maxH / baseVp.height
        );

        const rendered: PageImage[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled || renderIdRef.current !== myRenderId) return;

          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: fitScale });

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Could not get canvas 2D context");

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);

          await page.render({ canvas, canvasContext: ctx, viewport }).promise;

          // Each flipbook “page” is a single PDF page; flipbook itself shows 1 or 2 at once.
          if (i === 1) setPagePx({ w: canvas.width, h: canvas.height });

          rendered.push({ page: i, dataUrl: canvas.toDataURL("image/jpeg", 0.9) });
        }

        if (!cancelled && renderIdRef.current === myRenderId) setPages(rendered);
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render PDF");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vp.w, vp.h, isPortrait]);

  return (
    <main className="fixed inset-0 bg-neutral-900">
      <div className="relative h-full w-full p-6 grid place-items-center">
        {error && (
          <div className="absolute top-4 left-4 right-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
            {error}
          </div>
        )}

        {pages.length === 0 && !error && <p className="text-white">Loading the How to Spot a Class 701 Guide…</p>}

        {pages.length > 0 && pagePx && (
          <HTMLFlipBook
            style={{}}
            startPage={0}
            width={pagePx.w}
            height={pagePx.h}
            minWidth={pagePx.w}
            maxWidth={pagePx.w}
            minHeight={pagePx.h}
            maxHeight={pagePx.h}
            size="fixed"
            drawShadow={true}
            flippingTime={700}
            usePortrait={isPortrait}   // <-- key: false on desktop = two-page spread
            startZIndex={0}
            autoSize={false}
            maxShadowOpacity={0.25}
            showCover={true}
            mobileScrollSupport={true}
            clickEventForward={true}
            useMouseEvents={true}
            swipeDistance={30}
            showPageCorners={true}
            disableFlipByClick={false}
            className="shadow-2xl"
          >
            {pages.map((p) => (
              <div key={p.page} className="w-full h-full bg-white overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.dataUrl}
                  alt={`Page ${p.page}`}
                  className="w-full h-full object-contain"
                />
              </div>
            ))}
          </HTMLFlipBook>
        )}
      </div>
    </main>
  );
}