import React from "react";
import { LabelWithHint } from "../../common/InfoHint";
import { HELP_THRESHOLDS, parameterHelp } from "../../../content/helpContent";

type AngleBlock = { value: number; difficulty: string };

export type AngleMeasurementsInput = {
  angle_with_midline?: AngleBlock;
  angle_with_lateral?: AngleBlock;
  angle_with_occlusal?: AngleBlock;
  distance_to_occlusal?: number;
  distance_to_midline?: number;
};

type Props = {
  measurements: AngleMeasurementsInput;
  showThresholdSuffix?: boolean;
  distanceDecimals?: number;
};

function isAngleDifficultyBad(difficulty: string): boolean {
  return difficulty === "Unfavorable" || difficulty === "Difficult";
}

function difficultyClass(difficulty: string): string {
  return isAngleDifficultyBad(difficulty)
    ? "poppins text-red-600"
    : "poppins text-green-600";
}

function thresholdSuffix(
  key: "mid" | "lat" | "occ",
  difficulty: string,
  show: boolean,
): string {
  if (!show || difficulty !== "Unfavorable") return "";
  if (key === "mid") return ` (>${HELP_THRESHOLDS.angleMidlineDeg}°)`;
  if (key === "lat") return ` (>${HELP_THRESHOLDS.angleLateralDeg}°)`;
  return ` (>${HELP_THRESHOLDS.angleOcclusalDeg}°)`;
}

export const AngleDistanceDisplay: React.FC<Props> = ({
  measurements,
  showThresholdSuffix = false,
  distanceDecimals = 4,
}) => {
  const m = measurements;

  return (
    <div className="grid grid-cols-3 gap-4">
      {m.angle_with_midline && (
        <>
          <LabelWithHint
            label="Angle with Midline:"
            hintTitle="Angle to midline"
          >
            {parameterHelp.angle_with_midline}
          </LabelWithHint>
          <div className="poppins">
            {m.angle_with_midline.value.toFixed(2)}°
          </div>
          <div
            className={`poppins font-medium ${difficultyClass(
              m.angle_with_midline.difficulty,
            )}`}
          >
            {m.angle_with_midline.difficulty}
            {thresholdSuffix(
              "mid",
              m.angle_with_midline.difficulty,
              showThresholdSuffix,
            )}
          </div>
        </>
      )}

      {m.angle_with_lateral && (
        <>
          <LabelWithHint
            label="Angle with Lateral Incisor:"
            hintTitle="Angle to lateral incisor"
          >
            {parameterHelp.angle_with_lateral}
          </LabelWithHint>
          <div className="poppins">
            {m.angle_with_lateral.value.toFixed(2)}°
          </div>
          <div
            className={`poppins font-medium ${difficultyClass(
              m.angle_with_lateral.difficulty,
            )}`}
          >
            {m.angle_with_lateral.difficulty}
            {thresholdSuffix(
              "lat",
              m.angle_with_lateral.difficulty,
              showThresholdSuffix,
            )}
          </div>
        </>
      )}

      {m.angle_with_occlusal && (
        <>
          <LabelWithHint
            label="Angle with Occlusal Plane:"
            hintTitle="Angle to occlusal plane"
          >
            {parameterHelp.angle_with_occlusal}
          </LabelWithHint>
          <div className="poppins">
            {m.angle_with_occlusal.value.toFixed(2)}°
          </div>
          <div
            className={`poppins font-medium ${difficultyClass(
              m.angle_with_occlusal.difficulty,
            )}`}
          >
            {m.angle_with_occlusal.difficulty}
            {thresholdSuffix(
              "occ",
              m.angle_with_occlusal.difficulty,
              showThresholdSuffix,
            )}
          </div>
        </>
      )}

      {m.distance_to_occlusal !== undefined && (
        <>
          <LabelWithHint
            label="Distance to Occlusal Plane:"
            hintTitle="Distance to occlusal plane"
          >
            {parameterHelp.distance_to_occlusal}
          </LabelWithHint>
          <div className="poppins col-span-2">
            {m.distance_to_occlusal.toFixed(distanceDecimals)} pixel
          </div>
        </>
      )}

      {m.distance_to_midline !== undefined && (
        <>
          <LabelWithHint
            label="Distance to Midline:"
            hintTitle="Distance to midline"
          >
            {parameterHelp.distance_to_midline}
          </LabelWithHint>
          <div className="poppins col-span-2">
            {m.distance_to_midline.toFixed(distanceDecimals)} pixel
          </div>
        </>
      )}
    </div>
  );
};
