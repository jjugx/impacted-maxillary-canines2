/**
 * In-app help: methodology, parameter glossary, and tutorial (English).
 * Angle thresholds match backend/services/keypoint_detection.py.
 */

export const HELP_THRESHOLDS = {
  angleMidlineDeg: 31,
  angleLateralDeg: 51.47,
  angleOcclusalDeg: 132,
} as const;

export const methodologySections = [
  {
    title: "Analysis pipeline overview",
    body: [
      "The system detects anatomical keypoints on the radiograph, then constructs the canine long axis, facial midline, lateral incisor axis, and occlusal plane from those points.",
      "Angles between lines are computed from direction vectors using the dot product and reported in degrees (°).",
      "Perpendicular distances from the canine crown to the midline and occlusal line use the standard point-to-line formula in image pixel coordinates (values scale with image resolution, not clinical millimetres).",
      "Reference cut-offs for favourable vs unfavourable angles: midline > 31°, lateral incisor > 51.47°, occlusal > 132° (as implemented on the server).",
      "The overall label (e.g. normal / impacted / severely impacted) combines sector type, overlap, vertical position, root alignment, and angle flags. It supports clinical reasoning and must not replace a full clinical diagnosis.",
    ],
  },
] as const;

export const parameterHelp = {
  angle_with_midline:
    "Angle between the maxillary canine long axis and the facial midline. Values above 31° are classified as unfavourable for eruption in this model.",
  angle_with_lateral:
    "Angle between the canine axis and the lateral incisor long axis. Values above 51.47° are classified as unfavourable.",
  angle_with_occlusal:
    "Angle between the canine axis and the occlusal plane (line through reference occlusal landmarks). Values above 132° are classified as unfavourable.",
  distance_to_occlusal:
    "Perpendicular distance from the canine crown to the occlusal line, in pixels of the uploaded image—useful for relative comparison within the same image.",
  distance_to_midline:
    "Perpendicular distance from the canine crown to the midline, in pixels.",
  overlap_with_lateral:
    "Whether the canine and lateral incisor regions overlap in the segmentation—may indicate crowding or overlapping positions.",
  vertical_height:
    "Compares the vertical position of the canine crown to half the lateral incisor root length—deeper positions may be less favourable.",
  root_position:
    "Whether the root and crown are vertically aligned (small horizontal offset) or not, as defined by the server rules.",
  eruption_difficulty:
    "Summary of eruption difficulty from multiple geometric factors.",
  sector:
    "Sector classification from canine crown position relative to sector boundary lines on the image.",
  impaction_type:
    "Impaction category derived from sector (e.g. palatal, mid-alveolar, buccal)—feeds into the overall scoring.",
  roi_probability:
    "ROI classifier probability that the side is impacted-like, compared to the configured threshold.",
  difficult_factors:
    "Count of unfavourable factors combined in the assessment (angles, sector, overlap, etc.).",
  prediction_result:
    "Overall label produced by the server rules—always interpret together with the image and clinical findings.",
  roi_used_source:
    "Which analysis path or model produced the ROI / per-side results (for traceability).",
  roi_impacted_sides:
    "Sides flagged as impacted or above the ROI threshold—use alongside the rest of the analysis.",
} as const;

export const tutorialSteps = [
  {
    title: "Upload",
    text: "On the dashboard, choose a JPG/JPEG/PNG file or drop it on the upload area, then click Analyze Image.",
  },
  {
    title: "Review results",
    text: "After processing, the results page opens with the original image, overlays, and detailed metrics.",
  },
  {
    title: "Interactive view",
    text: "Use Interactive View to toggle midline, sector lines, occlusal plane, axes, and angle overlays on the image.",
  },
  {
    title: "Parameter tooltips",
    text: "Hover or focus the (i) icons next to labels for short definitions. Expand “Calculation methodology” for formulas and thresholds.",
  },
  {
    title: "Export",
    text: "Use Export PDF when available to download a summary. Verify landmark positions before clinical use; corrections follow the in-app save flow.",
  },
] as const;
