import React, { useRef, useEffect, useState } from "react";

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

interface LineVisibility {
  midline: boolean;
  sectorLines: boolean;
  occlusalPlane: boolean;
  canineAxis: boolean;
  lateralAxis: boolean;
  keypoints: boolean;
  roiBoxes: boolean;
  angles: boolean;
}

interface MeasurementCanvasProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
  originalImage: string;
  fullSize?: boolean;
  activeSide?: string; // kept for compatibility (used in ROI label thickness only)
  lineVisibility?: LineVisibility; // Optional visibility controls
  editable?: boolean; // Enable keypoint editing
  editedKeypoints?: Array<{label: string; x: number; y: number; confidence: number}>; // Edited keypoints from parent
  onKeypointsChange?: (keypoints: Array<{label: string; x: number; y: number; confidence: number}>) => void; // Callback when keypoints are updated
}

const MeasurementCanvasPanel: React.FC<MeasurementCanvasProps> = ({
  result,
  originalImage,
  fullSize = false,
  activeSide = "right",
  lineVisibility = {
    midline: true,
    sectorLines: true,
    occlusalPlane: true,
    canineAxis: true,
    lateralAxis: true,
    keypoints: true,
    roiBoxes: true,
    angles: true,
  },
  editable = false,
  editedKeypoints: editedKeypointsProp,
  onKeypointsChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Local state for dragging - use prop if available, otherwise use local state as fallback
  const [localEditedKeypoints, setLocalEditedKeypoints] = useState<Array<{label: string; x: number; y: number; confidence: number}> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [draggedKeypoint, setDraggedKeypoint] = useState<{label: string; index: number} | null>(null);
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);
  
  // Use prop if available, otherwise use local state
  const editedKeypoints = editedKeypointsProp || localEditedKeypoints;

  // Helper: draw a line
  const drawLine = (ctx: CanvasRenderingContext2D, line: Line, color: string, width: number) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.moveTo(line.start.x, line.start.y);
    ctx.lineTo(line.end.x, line.end.y);
    ctx.stroke();
  };

  const drawRectWithLabel = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    label: string,
    isFullSize = false,
    lineWidth = 2,
  ) => {
    const w = Math.max(1, x2 - x1);
    const h = Math.max(1, y2 - y1);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    ctx.fillRect(x1, y1, w, h);
    ctx.globalAlpha = 1.0;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.strokeRect(x1, y1, w, h);
    ctx.font = isFullSize ? "bold 13px Arial" : "bold 11px Arial";
    const tm = ctx.measureText(label);
    const padX = 6;
    const boxH = isFullSize ? 20 : 16;
    let lx = x1;
    let ly = Math.max(0, y1 - (boxH + 2));
    if (lx + tm.width + padX * 2 > ctx.canvas.width) {
      lx = Math.max(0, ctx.canvas.width - (tm.width + padX * 2) - 4);
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(lx, ly, tm.width + padX * 2, boxH);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(label, lx + padX, ly + (isFullSize ? 14 : 12));
    ctx.restore();
  };

  const drawRoiInfoBadge = (ctx: CanvasRenderingContext2D, text: string) => {
    const x = 20;
    const y = 64;
    ctx.save();
    ctx.font = "12px Arial";
    const tm = ctx.measureText(text);
    const padX = 8;
    const w = tm.width + padX * 2;
    const h = 22;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#111827";
    ctx.textAlign = "left";
    ctx.fillText(text, x + padX, y + h - 7);
    ctx.restore();
  };

  const drawLabel = (
    ctx: CanvasRenderingContext2D,
    line: Line,
    text: string,
    color: string,
    isFullSize = false,
  ) => {
    const midX = (line.start.x + line.end.x) / 2;
    const midY = (line.start.y + line.end.y) / 2;
    ctx.font = isFullSize ? "14px Arial" : "12px Arial";
    const textMeasure = ctx.measureText(text);
    const padding = 4;
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillRect(
      midX - textMeasure.width / 2 - padding,
      midY - 16,
      textMeasure.width + padding * 2,
      20
    );
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, midX, midY - 2);
  };

  const drawKeypoint = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    confidence: number,
    isFullSize = false,
    isDragging = false,
  ) => {
    ctx.beginPath();
    const radius = isFullSize ? (isDragging ? 7 : 5) : (isDragging ? 5 : 3);
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    
    // Highlight when dragging or in edit mode
    if (isDragging) {
      ctx.fillStyle = "rgba(0, 150, 255, 0.9)";
      ctx.strokeStyle = "rgba(0, 100, 255, 1)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (editable) {
      ctx.fillStyle = "rgba(255, 200, 0, 0.8)";
    } else if (confidence > 0.7) {
      ctx.fillStyle = "rgba(0, 255, 0, 0.7)";
    } else if (confidence > 0.5) {
      ctx.fillStyle = "rgba(255, 255, 0, 0.7)";
    } else {
      ctx.fillStyle = "rgba(255, 0, 0, 0.7)";
    }
    ctx.fill();
    
    if (isFullSize) {
      ctx.font = "11px Arial";
      const tm = ctx.measureText(label);
      ctx.fillStyle = isDragging ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.5)";
      ctx.fillRect(x + 6, y - 10, tm.width + 4, 14);
      ctx.fillStyle = "white";
      ctx.fillText(label, x + 8, y);
    }
  };

  const drawAngle = (
    ctx: CanvasRenderingContext2D,
    p1: Point,
    p2: Point,
    p3: Point,
    angleText: string,
    color: string,
    isFullSize = false,
  ) => {
    const radius = isFullSize ? 40 : 25;
    const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
    const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = isFullSize ? 3 : 2;
    ctx.moveTo(p2.x, p2.y);
    ctx.arc(p2.x, p2.y, radius, a1, a2, false);
    ctx.stroke();
    const textX = p2.x + (radius + 10) * Math.cos((a1 + a2) / 2);
    const textY = p2.y + (radius + 10) * Math.sin((a1 + a2) / 2);
    ctx.font = isFullSize ? "bold 14px Arial" : "bold 12px Arial";
    const tm = ctx.measureText(angleText);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(textX - tm.width / 2 - 2, textY - 10, tm.width + 4, 16);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(angleText, textX, textY);
  };

  const drawLegend = (ctx: CanvasRenderingContext2D, _w: number, h: number) => {
    const legendX = 20;
    const legendY = h - 180;
    const lineLength = 30;
    const padding = 8;
    const lineSpacing = 24;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(legendX, legendY, 230, 170);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY, 230, 170);
    ctx.font = "bold 14px Arial";
    ctx.fillStyle = "black";
    ctx.fillText("Measurement Legend:", legendX + padding, legendY + 20);
    ctx.font = "12px Arial";
    let y = legendY + 45;
    ctx.strokeStyle = "rgba(0,0,255,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(legendX + padding, y);
    ctx.lineTo(legendX + padding + lineLength, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,255,0.9)";
    ctx.fillText("Midline", legendX + padding + lineLength + 8, y + 4);
    y += lineSpacing;
    ctx.strokeStyle = "rgba(255,0,0,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legendX + padding, y);
    ctx.lineTo(legendX + padding + lineLength, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,0,0,0.9)";
    ctx.fillText("Sector Lines", legendX + padding + lineLength + 8, y + 4);
    y += lineSpacing;
    ctx.strokeStyle = "rgba(153,51,255,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(legendX + padding, y);
    ctx.lineTo(legendX + padding + lineLength, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(153,51,255,0.9)";
    ctx.fillText("Occlusal Plane", legendX + padding + lineLength + 8, y + 4);
    y += lineSpacing;
    ctx.strokeStyle = "rgba(255,204,0,0.8)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(legendX + padding, y);
    ctx.lineTo(legendX + padding + lineLength, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,204,0,0.9)";
    ctx.fillText("Canine Axis", legendX + padding + lineLength + 8, y + 4);
    y += lineSpacing;
    ctx.strokeStyle = "rgba(0,204,255,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(legendX + padding, y);
    ctx.lineTo(legendX + padding + lineLength, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,204,255,0.9)";
    ctx.fillText("Lateral Incisor", legendX + padding + lineLength + 8, y + 4);
    y += lineSpacing;
    ctx.fillStyle = "rgba(0,255,0,0.7)";
    ctx.beginPath();
    ctx.arc(legendX + padding + lineLength / 2, y, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.fillText("Keypoints", legendX + padding + lineLength + 8, y + 4);
  };

  // Initialize local edited keypoints from result when entering edit mode (only if prop not provided)
  useEffect(() => {
    if (!editedKeypointsProp && result && Array.isArray(result.keypoints) && editable && (!localEditedKeypoints || localEditedKeypoints.length === 0)) {
      const kps = result.keypoints.map((kp: any) => ({
        label: kp.label,
        x: Number(kp.x),
        y: Number(kp.y),
        confidence: Number(kp.confidence || 0.8)
      }));
      setLocalEditedKeypoints(kps);
    } else if (!editable && localEditedKeypoints) {
      // Clear local edited keypoints when exiting edit mode (only if using local state)
      setLocalEditedKeypoints(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, editedKeypointsProp]); // Depend on editable and prop

  // Mouse event handlers for dragging keypoints
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editable || !canvasRef.current || !editedKeypoints) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Get scale factors
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;
    
    // Find clicked keypoint
    const clickRadius = 10;
    for (let i = 0; i < editedKeypoints.length; i++) {
      const kp = editedKeypoints[i];
      const kpX = kp.x * (canvas.width / imageWidth);
      const kpY = kp.y * (canvas.height / imageHeight);
      const dist = Math.sqrt(Math.pow(canvasX - kpX, 2) + Math.pow(canvasY - kpY, 2));
      
      if (dist <= clickRadius) {
        setDraggedKeypoint({ label: kp.label, index: i });
        canvas.style.cursor = 'grabbing';
        break;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editable || !canvasRef.current || !editedKeypoints) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (draggedKeypoint) {
      // Update keypoint position - convert canvas coordinates to image coordinates
      const scaleX = imageWidth / canvas.width;
      const scaleY = imageHeight / canvas.height;
      const newX = (x / rect.width) * canvas.width * scaleX;
      const newY = (y / rect.height) * canvas.height * scaleY;
      
      const updated = [...editedKeypoints];
      updated[draggedKeypoint.index] = {
        ...updated[draggedKeypoint.index],
        x: newX,
        y: newY,
        confidence: 1.0 // Manual correction = high confidence
      };
      
      // Update via callback if available, otherwise update local state
      if (onKeypointsChange) {
        onKeypointsChange(updated);
      } else {
        setLocalEditedKeypoints(updated);
      }
      
      // Trigger redraw with updated keypoints - this will recalculate geometry
      // The useEffect will handle the full redraw when editedKeypoints changes
    } else {
      // Check if hovering over a keypoint
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = x * scaleX;
      const canvasY = y * scaleY;
      
      let hovering = false;
      for (const kp of editedKeypoints) {
        const kpX = kp.x * (canvas.width / imageWidth);
        const kpY = kp.y * (canvas.height / imageHeight);
        const dist = Math.sqrt(Math.pow(canvasX - kpX, 2) + Math.pow(canvasY - kpY, 2));
        if (dist <= 10) {
          hovering = true;
          break;
        }
      }
      canvas.style.cursor = hovering ? 'grab' : 'default';
    }
  };

  const handleMouseUp = () => {
    if (draggedKeypoint && editedKeypoints && onKeypointsChange) {
      // Notify parent component of changes
      onKeypointsChange(editedKeypoints);
    }
    setDraggedKeypoint(null);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default';
    }
  };

  useEffect(() => {
    if (!result || !originalImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "Anonymous";

    // Use edited keypoints if in edit mode, otherwise use original
    const keypointsToUse = (editable && editedKeypoints) ? editedKeypoints : (result?.keypoints || []);

    // Helper: keypoint map for fallbacks - use edited keypoints for geometry calculations
    const kpMap: Record<string, { x: number; y: number; confidence: number } | undefined> = {};
    if (keypointsToUse && Array.isArray(keypointsToUse)) {
      for (const kp of keypointsToUse as any[]) {
        if (kp && typeof kp.label === "string") {
          kpMap[kp.label] = { x: Number(kp.x), y: Number(kp.y), confidence: Number(kp.confidence || 0) };
        }
      }
    }

    const getPt = (label: string): Point | undefined => {
      const v = kpMap[label];
      return v ? { x: v.x, y: v.y } : undefined;
    };

    const midpoint = (a?: Point, b?: Point): Point | undefined => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined);

    const angleBetweenLinesDeg = (l1?: Line, l2?: Line): number | undefined => {
      if (!l1 || !l2) return undefined;
      const v1 = { x: l1.end.x - l1.start.x, y: l1.end.y - l1.start.y };
      const v2 = { x: l2.end.x - l2.start.x, y: l2.end.y - l2.start.y };
      const n1 = Math.hypot(v1.x, v1.y);
      const n2 = Math.hypot(v2.x, v2.y);
      if (n1 === 0 || n2 === 0) return undefined;
      const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (n1 * n2)));
      return (Math.acos(cos) * 180) / Math.PI;
    };

    const computeFallbackGeometry = (side: "right" | "left") => {
      const isRight = side === "right";
      const cRoot = getPt(isRight ? "r13" : "r23");
      const cCrown = getPt(isRight ? "c13" : "c23");
      const lRoot = getPt(isRight ? "r12" : "r22");
      const lCrown = getPt(isRight ? "c12" : "c22");
      const ceRoot = getPt(isRight ? "r11" : "r21");
      const ceCrown = getPt(isRight ? "c11" : "c21");
      const p1Root = getPt(isRight ? "r14" : "r24");
      const p1Crown = getPt(isRight ? "c14" : "c24");
      const p2Root = getPt(isRight ? "r15" : "r25");
      const p2Crown = getPt(isRight ? "c15" : "c25");
      const m1pt = getPt("m1");
      const m2pt = getPt("m2");
      const mb = getPt(isRight ? "mb16" : "mb26");
      const geom: any = {};
      if (m1pt && m2pt) geom.midline = { start: m1pt, end: m2pt } as Line;
      if (m2pt && mb) geom.occlusal_plane = { start: m2pt, end: mb } as Line;
      const L1s = midpoint(ceRoot, lRoot);
      const L1e = midpoint(ceCrown, lCrown);
      const L2s = midpoint(lRoot, cRoot);
      const L2e = midpoint(lCrown, cCrown);
      const L3s = midpoint(cRoot, p1Root);
      const L3e = midpoint(cCrown, p1Crown);
      const L4s = midpoint(p1Root, p2Root);
      const L4e = midpoint(p1Crown, p2Crown);
      const sector_lines: any = {};
      if (L1s && L1e) sector_lines.L1 = { start: L1s, end: L1e } as Line;
      if (L2s && L2e) sector_lines.L2 = { start: L2s, end: L2e } as Line;
      if (L3s && L3e) sector_lines.L3 = { start: L3s, end: L3e } as Line;
      if (L4s && L4e) sector_lines.L4 = { start: L4s, end: L4e } as Line;
      if (Object.keys(sector_lines).length > 0) geom.sector_lines = sector_lines;
      if (cRoot && cCrown) geom.canine_axis = { start: cRoot, end: cCrown } as Line;
      if (lRoot && lCrown) geom.lateral_axis = { start: lRoot, end: lCrown } as Line;
      const angles: any = {};
      if (geom.canine_axis && geom.midline) {
        const v = angleBetweenLinesDeg(geom.canine_axis, geom.midline);
        if (typeof v === "number") angles.angle_with_midline = { value: v };
      }
      if (geom.canine_axis && geom.lateral_axis) {
        const v = angleBetweenLinesDeg(geom.canine_axis, geom.lateral_axis);
        if (typeof v === "number") angles.angle_with_lateral = { value: v };
      }
      if (geom.canine_axis && geom.occlusal_plane) {
        const v = angleBetweenLinesDeg(geom.canine_axis, geom.occlusal_plane);
        if (typeof v === "number") angles.angle_with_occlusal = { value: v };
      }
      if (Object.keys(angles).length > 0) geom.fallback_angles = angles;
      return geom;
    };

    const drawAllMeasurements = (
      ctx: CanvasRenderingContext2D,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analysis: any,
      width: number,
      height: number,
      scaleX: number,
      scaleY: number,
    ) => {
      const sx = (x: number) => x * scaleX;
      const sy = (y: number) => y * scaleY;

      // Always use edited keypoints for geometry calculations (via kpMap)
      const right = analysis?.side_analyses?.right || {};
      const left = analysis?.side_analyses?.left || {};
      const fbRight = computeFallbackGeometry("right");
      const fbLeft = computeFallbackGeometry("left");

      // Background image must already be drawn by caller

      // Define midline for use in angles calculation (needed even if not drawn)
      const midline: Line | undefined = analysis.midline || right.midline || left.midline || fbRight.midline || fbLeft.midline;

      // Midline (global)
      if (lineVisibility.midline && midline) {
        drawLine(ctx, { start: { x: sx(midline.start.x), y: sy(midline.start.y) }, end: { x: sx(midline.end.x), y: sy(midline.end.y) } }, "rgba(0,0,255,0.8)", fullSize ? 3 : 2);
        drawLabel(ctx, { start: { x: sx(midline.start.x), y: sy(midline.start.y) }, end: { x: sx(midline.end.x), y: sy(midline.end.y) } }, "Midline", "rgba(0,0,255,0.8)", fullSize);
      }

      const drawSectors = (sl?: any) => {
        if (!sl) return;
        const drawBoundary = (lineObj: Line | undefined, label: string, color: string) => {
          if (!lineObj) return;
          const L = { start: { x: sx(lineObj.start.x), y: sy(lineObj.start.y) }, end: { x: sx(lineObj.end.x), y: sy(lineObj.end.y) } };
          drawLine(ctx, L, color, fullSize ? 3 : 2);
          drawLabel(ctx, L, label, color, fullSize);
        };
        if (sl.L1 || sl.L2 || sl.L3 || sl.L4) {
          drawBoundary(sl.L1, "L1", "rgba(255,0,0,0.85)");
          drawBoundary(sl.L2, "L2", "rgba(0,176,80,0.85)");
          drawBoundary(sl.L3, "L3", "rgba(255,153,0,0.85)");
          drawBoundary(sl.L4, "L4", "rgba(128,128,128,0.9)");
        } else {
          drawBoundary(sl.sector2, "Sector 2", "rgba(255,0,0,0.85)");
          drawBoundary(sl.sector3, "Sector 3", "rgba(0,176,80,0.85)");
          drawBoundary(sl.sector4, "Sector 4", "rgba(255,153,0,0.85)");
        }
      };

      // Draw sector lines for both sides
      if (lineVisibility.sectorLines) {
        drawSectors(right.sector_lines || fbRight.sector_lines);
        drawSectors(left.sector_lines || fbLeft.sector_lines);
      }

      const drawOcclusal = (oc?: Line) => {
        if (!oc) return;
        const L = { start: { x: sx(oc.start.x), y: sy(oc.start.y) }, end: { x: sx(oc.end.x), y: sy(oc.end.y) } };
        drawLine(ctx, L, "rgba(153,51,255,0.8)", fullSize ? 3 : 2);
        drawLabel(ctx, L, "Occlusal Plane", "rgba(153,51,255,0.8)", fullSize);
      };
      if (lineVisibility.occlusalPlane) {
        drawOcclusal(right.occlusal_plane || fbRight.occlusal_plane);
        drawOcclusal(left.occlusal_plane || fbLeft.occlusal_plane);
      }

      const drawAxis = (axis?: Line, label = "Canine Axis", color = "rgba(255,204,0,0.8)", width = fullSize ? 4 : 3) => {
        if (!axis) return;
        const L = { start: { x: sx(axis.start.x), y: sy(axis.start.y) }, end: { x: sx(axis.end.x), y: sy(axis.end.y) } };
        drawLine(ctx, L, color, width);
        drawLabel(ctx, L, label, color, fullSize);
      };
      if (lineVisibility.canineAxis) {
        drawAxis(right.canine_axis || fbRight.canine_axis, "Canine Axis", "rgba(255,204,0,0.8)", fullSize ? 4 : 3);
        drawAxis(left.canine_axis || fbLeft.canine_axis, "Canine Axis", "rgba(255,204,0,0.8)", fullSize ? 4 : 3);
      }
      if (lineVisibility.lateralAxis) {
        drawAxis(right.lateral_axis || fbRight.lateral_axis, "Lateral Incisor", "rgba(0,204,255,0.8)", fullSize ? 3 : 2);
        drawAxis(left.lateral_axis || fbLeft.lateral_axis, "Lateral Incisor", "rgba(0,204,255,0.8)", fullSize ? 3 : 2);
      }

      // Keypoints (draw all so both sides visible)
      const keypointsToDraw = (editable && editedKeypoints) ? editedKeypoints : (result?.keypoints || []);
      if (lineVisibility.keypoints && Array.isArray(keypointsToDraw)) {
        for (const kp of keypointsToDraw as any[]) {
          const isDragging = draggedKeypoint?.label === kp.label;
          drawKeypoint(ctx, sx(kp.x), sy(kp.y), kp.label, kp.confidence, fullSize, isDragging);
        }
      }

      // ROI boxes
      if (lineVisibility.roiBoxes) {
        const roi = analysis?.roi;
        if (roi && roi.sides) {
          for (const [side, info] of Object.entries<any>(roi.sides)) {
            if (!info?.bbox || info.bbox.length < 4) continue;
            const [x1, y1, x2, y2] = info.bbox as number[];
            const impacted = Boolean(info.impacted);
            const prob = typeof info.prob === "number" ? info.prob : 0;
            const color = impacted ? "rgba(239,68,68,0.95)" : "rgba(34,197,94,0.95)";
            const lw = fullSize ? (side === activeSide ? 4 : 3) : (side === activeSide ? 3 : 2);
            const label = `${side.toUpperCase()} ${Math.round(prob * 100)}% ${impacted ? "Impacted" : "Normal"}`;
            drawRectWithLabel(ctx, sx(x1), sy(y1), sx(x2), sy(y2), color, label, fullSize, lw);
          }
        }
      }

      // Angles per side
      const drawAnglesFor = (angles: any, cx?: Line, ml?: Line, lx?: Line, oc?: Line) => {
        if (!angles || !cx) return;
        if (angles.angle_with_midline && ml) {
          const val = angles.angle_with_midline.value ?? angleBetweenLinesDeg(cx, ml) ?? 0;
          drawAngle(ctx, { x: sx(cx.end.x), y: sy(cx.end.y) }, { x: sx(cx.start.x), y: sy(cx.start.y) }, { x: sx(ml.end.x), y: sy(ml.end.y) }, `${val.toFixed(1)}°`, "rgba(0,0,255,0.7)", fullSize);
        }
        if (angles.angle_with_lateral && lx) {
          const val = angles.angle_with_lateral.value ?? angleBetweenLinesDeg(cx, lx) ?? 0;
          drawAngle(ctx, { x: sx(cx.end.x), y: sy(cx.end.y) }, { x: sx(cx.start.x), y: sy(cx.start.y) }, { x: sx(lx.end.x), y: sy(lx.end.y) }, `${val.toFixed(1)}°`, "rgba(255,165,0,0.7)", fullSize);
        }
        if (angles.angle_with_occlusal && oc) {
          const val = angles.angle_with_occlusal.value ?? angleBetweenLinesDeg(cx, oc) ?? 0;
          drawAngle(ctx, { x: sx(cx.end.x), y: sy(cx.end.y) }, { x: sx(cx.start.x), y: sy(cx.start.y) }, { x: sx(oc.end.x), y: sy(oc.end.y) }, `${val.toFixed(1)}°`, "rgba(128,0,128,0.7)", fullSize);
        }
      };

      if (lineVisibility.angles) {
        drawAnglesFor(right.angle_measurements || fbRight.fallback_angles, right.canine_axis || fbRight.canine_axis, midline, right.lateral_axis || fbRight.lateral_axis, right.occlusal_plane || fbRight.occlusal_plane);
        drawAnglesFor(left.angle_measurements || fbLeft.fallback_angles, left.canine_axis || fbLeft.canine_axis, midline, left.lateral_axis || fbLeft.lateral_axis, left.occlusal_plane || fbLeft.occlusal_plane);
      }

      if (fullSize) drawLegend(ctx, width, height);

      if (fullSize && analysis?.side_analyses) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(20, 20, 140, 36);
        ctx.font = "bold 18px Arial";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.fillText("BOTH SIDES", 30, 44);
      }

      if (fullSize && analysis?.roi) {
        const usedSource: string = analysis.roi.used_source || "-";
        const thrVal: number = typeof analysis.roi.threshold === "number" ? analysis.roi.threshold : 0.5;
        drawRoiInfoBadge(ctx, `ROI: ${usedSource}  |  thr=${thrVal.toFixed(2)}`);
      }
    };

    img.onload = () => {
      setIsLoading(false);
      let canvasWidth = img.width;
      let canvasHeight = img.height;
      if (fullSize) {
        const maxWidth = window.innerWidth * 0.85;
        const maxHeight = window.innerHeight * 0.75;
        const imgRatio = img.width / img.height;
        if (img.width / maxWidth > img.height / maxHeight) {
          canvasWidth = maxWidth;
          canvasHeight = canvasWidth / imgRatio;
        } else {
          canvasHeight = maxHeight;
          canvasWidth = canvasHeight * imgRatio;
        }
      }
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      setImageWidth(img.width);
      setImageHeight(img.height);
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      
      // Create a modified result with edited keypoints if in edit mode
      // This ensures geometry calculations use updated keypoints
      const resultToUse = editable && editedKeypoints ? {
        ...result,
        keypoints: editedKeypoints
      } : result;
      
      // Geometry calculations will use edited keypoints via kpMap
      drawAllMeasurements(
        ctx, 
        resultToUse.analysis, 
        canvasWidth, 
        canvasHeight, 
        canvasWidth / img.width, 
        canvasHeight / img.height
      );
    };

    img.src = originalImage;

    return () => {
      img.onload = null;
    };
  }, [result, originalImage, fullSize, activeSide, lineVisibility, editable, editedKeypoints, draggedKeypoint, imageWidth, imageHeight]);


  return (
    <div className={`relative ${fullSize ? 'w-full h-full' : ''}`}>
      {/* Show loading indicator while image is loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
            <p className="text-sm text-gray-600">Loading interactive view...</p>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className={`${fullSize ? 'max-w-full max-h-[75vh]' : 'max-h-80 w-full'} object-contain mx-auto ${editable ? 'cursor-grab' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Indicator badge when in interactive mode */}
      <div className="absolute bottom-2 right-2 bg-white bg-opacity-70 text-xs px-2 py-1 rounded">
        <i className="fa-solid fa-wand-magic-sparkles mr-1 text-blue-500"></i>
        Interactive View
      </div>
    </div>
  );
};

export default MeasurementCanvasPanel;
