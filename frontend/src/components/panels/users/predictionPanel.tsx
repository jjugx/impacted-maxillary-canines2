import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { useLoading } from "../../contexts/loadingContext";
import ToggleMenuPanel from "../admin/menu/toggleMenuPanel";
import MeasurementCanvasPanel from "./measurementCanvasPanel";
import { generatePDF } from "../../../utils/reportGenerator";
import ImageModal from "../../common/ImageModal";

// Type definitions for keypoints
type Keypoint = {
  label: string;
  x: number;
  y: number;
  confidence: number;
};

// Type definitions for analysis results
type AnalysisResult = {
  dental_analysis?: DentalAnalysis;
  roi?: {
    model?: string;
    threshold?: number;
    used_source?: string;
    impacted_sides?: string[];
    overall_impacted?: boolean;
    prediction_result?: string;
    sides?: Record<string, { prob: number; impacted: boolean; bbox: number[] }>;
  };
  side_analyses?: {
    left?: {
      sector_analysis?: {
        sector: number;
        impaction_type: string;
      };
      canine_assessment?: {
        overlap: string;
        vertical_height: string;
        root_position: string;
        eruption_difficulty: string;
      };
      angle_measurements?: {
        angle_with_midline?: {
          value: number;
          difficulty: string;
        };
        angle_with_lateral?: {
          value: number;
          difficulty: string;
        };
        angle_with_occlusal?: {
          value: number;
          difficulty: string;
        };
        distance_to_occlusal?: number;
        distance_to_midline?: number;
      };
      difficult_factors?: number;
      prediction_result: string;
      side: string;
    };
    right?: {
      sector_analysis?: {
        sector: number;
        impaction_type: string;
      };
      canine_assessment?: {
        overlap: string;
        vertical_height: string;
        root_position: string;
        eruption_difficulty: string;
      };
      angle_measurements?: {
        angle_with_midline?: {
          value: number;
          difficulty: string;
        };
        angle_with_lateral?: {
          value: number;
          difficulty: string;
        };
        angle_with_occlusal?: {
          value: number;
          difficulty: string;
        };
        distance_to_occlusal?: number;
        distance_to_midline?: number;
      };
      difficult_factors?: number;
      prediction_result: string;
      side: string;
    };
  };
  sector_analysis?: {
    sector: number;
    impaction_type: string;
  };
  canine_assessment?: {
    overlap: string;
    vertical_height: string;
    root_position: string;
    eruption_difficulty: string;
  };
  angle_measurements?: {
    angle_with_midline?: {
      value: number;
      difficulty: string;
    };
    angle_with_lateral?: {
      value: number;
      difficulty: string;
    };
    angle_with_occlusal?: {
      value: number;
      difficulty: string;
    };
    distance_to_occlusal?: number;
    distance_to_midline?: number;
  };
  difficult_factors?: number;
  prediction_result: string;
  error?: string;
  warning?: string;
  note?: string;
  midline?: unknown;
  sector_lines?: unknown;
  occlusal_plane?: unknown;
  canine_axis?: unknown;
  lateral_axis?: unknown;
};

// Types for ROI-gated dental analysis
type DentalAngle = { value: number; difficulty: string };
type DentalAnglesAndDistances = {
  angle_with_midline?: DentalAngle;
  angle_with_lateral?: DentalAngle;
  angle_with_occlusal?: DentalAngle;
  distance_to_occlusal?: number;
  distance_to_midline?: number;
};
type DentalSector = { sector: number; impaction_type: string };
type DentalThreeFactor = {
  overlap_with_lateral: string;
  vertical_height: string;
  root_apex_position: string;
  eruption_difficulty: string;
};
type DentalSide = {
  side: string;
  skipped: boolean;
  reason?: string | null;
  sector_classification?: DentalSector;
  three_factor_assessment?: DentalThreeFactor;
  angles_and_distances?: DentalAnglesAndDistances;
};
type DentalAnalysis = {
  right?: DentalSide;
  left?: DentalSide;
  overlay_image?: string;
};

// Type definitions for detection results
type DetectionResult = {
  id: string;
  user_id: string;
  image_path: string;
  result_path: string;
  confidence_score: number;
  prediction_result: string;
  keypoints: Keypoint[];
  analysis: AnalysisResult;
  created_at: string;
};

const PredictionPanel = () => {
  // Get detection ID from URL parameters
  const { detectionId } = useParams();
  // Access the loading context
  const { setLoading } = useLoading();
  // Navigation hook
  const navigate = useNavigate();

  // State for detection results and images
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string>("");
  const [resultImage, setResultImage] = useState<string>("");
  const [segmentationImage, setSegmentationImage] = useState<string>("");
  const [activeSide, setActiveSide] = useState<string>("right");
  const [dentalOverlayImage, setDentalOverlayImage] = useState<string>("");

  // State for interactive view (modal open/close)
  const [isInteractiveModalOpen, setIsInteractiveModalOpen] =
    useState<boolean>(false);

  // State for line visibility controls
  const [lineVisibility, setLineVisibility] = useState({
    midline: true,
    sectorLines: true,
    occlusalPlane: true,
    canineAxis: true,
    lateralAxis: true,
    keypoints: true,
    roiBoxes: true,
    angles: true,
  });

  // State for image modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalImage, setModalImage] = useState<string>("");
  const [modalTitle, setModalTitle] = useState<string>("");

  // State for keypoint editing
  const [isEditingKeypoints, setIsEditingKeypoints] = useState<boolean>(false);
  const [editedKeypoints, setEditedKeypoints] = useState<Keypoint[]>([]);
  const [isSavingKeypoints, setIsSavingKeypoints] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<DetectionResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [hasBeenCorrected, setHasBeenCorrected] = useState<boolean>(false);

  // Fetch prediction results when component mounts or detectionId changes
  useEffect(() => {
    const fetchPredictionResult = async () => {
      setLoading(true);
      try {
        if (!detectionId) {
          setError("Detection ID is missing");
          setTimeout(() => setLoading(false), 200);
          return;
        }

        const response = await axiosInstance.get(`/detection/${detectionId}`);

        if (response.data.status === "success") {
          const det = response.data.detection;
          // If backend returned combined final_prediction and roi, merge into analysis for display
          if (response.data.final_prediction && det?.analysis) {
            det.prediction_result = response.data.final_prediction;
            det.analysis.prediction_result = response.data.final_prediction;
            if (response.data.roi) {
              (det.analysis as any).roi = response.data.roi;
            }
          }
          setResult(det);
          
          // Check if detection has already been corrected
          // We'll check this by trying to edit - if it fails, it's already corrected
          // For now, we'll check by looking for corrected_keypoints in the response if available
          // Or we can make a separate check, but for simplicity, we'll check on edit attempt

          // Set segmentation data if available
          if (response.data.detection.segmentation) {
            // Set segmentation image if available
            if (response.data.detection.segmentation.result_image) {
              const segFilename =
                response.data.detection.segmentation.result_image;
              setSegmentationImage(
                `${axiosInstance.defaults.baseURL}/results/${segFilename}`,
              );
            }
          }

          // Get the image paths and fetch images
          const imagePath = response.data.detection.image_path;
          const resultPath = response.data.detection.result_path;

          // Get the filename from the path
          const originalFilename = imagePath.split("/").pop();
          const resultFilename = resultPath.split("/").pop();

          // Set image URLs
          setOriginalImage(
            `${axiosInstance.defaults.baseURL}/uploads/${originalFilename}`,
          );
          setResultImage(
            `${axiosInstance.defaults.baseURL}/results/${resultFilename}`,
          );

          // Set dental overlay if available in analysis
          try {
            const dental = det?.analysis?.dental_analysis;
            const overlayName = dental?.overlay_image;
            if (overlayName) {
              setDentalOverlayImage(
                `${axiosInstance.defaults.baseURL}/results/${overlayName}`,
              );
            } else {
              setDentalOverlayImage("");
            }
          } catch (_) {
            setDentalOverlayImage("");
          }
          setTimeout(() => setLoading(false), 200);
        } else {
          setError(
            response.data.message || "Error retrieving prediction result",
          );
          setTimeout(() => setLoading(false), 200);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error("Error fetching prediction:", err);
        setError("Failed to fetch prediction result");
        setTimeout(() => setLoading(false), 200);
      }
    };

    fetchPredictionResult();
  }, [detectionId, setLoading]);

  // Preview analysis when editedKeypoints change (with debounce)
  useEffect(() => {
    if (!isEditingKeypoints || !editedKeypoints || editedKeypoints.length === 0 || !detectionId) {
      setPreviewResult(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoadingPreview(true);
      try {
        const response = await axiosInstance.post(
          `/detection/${detectionId}/keypoints/preview`,
          { keypoints: editedKeypoints }
        );
        
        if (response.data.status === "success") {
          // Create preview result object
          const preview: DetectionResult = {
            ...result!,
            keypoints: response.data.keypoints,
            analysis: {
              ...response.data.analysis,
              roi: response.data.roi || result?.analysis?.roi,
              dental_analysis: response.data.dental_analysis || result?.analysis?.dental_analysis,
            },
            prediction_result: response.data.prediction_result,
          };
          setPreviewResult(preview);
        }
      } catch (error: any) {
        console.error("Error previewing analysis:", error);
        setPreviewResult(null);
      } finally {
        setIsLoadingPreview(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [editedKeypoints, isEditingKeypoints, detectionId, result]);

  // Format date string to localized format (matching history panel format)
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok'
      }).format(date);
    } catch (err) {
      console.error("Error formatting date:", err);
      return dateString; // Return original string if formatting fails
    }
  };

  // Navigate back to dashboard
  const handleGoBack = () => {
    navigate("/dashboard");
  };

  // Export results to PDF
  const handleExportPDF = async () => {
    if (result) {
      await generatePDF(result, {
        originalImage,
        resultImage,
        segmentationImage,
        dentalOverlayImage,
      });
    }
  };

  // Open the image modal
  const openImageModal = (imageSrc: string, title: string) => {
    setModalImage(imageSrc);
    setModalTitle(title);
    setIsModalOpen(true);
  };

  // Open interactive view in fullscreen modal
  const openInteractiveModal = () => {
    setIsInteractiveModalOpen(true);
  };

  // Helper function to format prediction result with proper capitalization
  const formatPredictionResult = (result: string) => {
    if (!result) return "Unknown";

    // Split by spaces to format each word
    return result
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Helper function to get color based on prediction result
  const getPredictionColor = (result: string) => {
    if (!result) return "text-gray-600";

    if (result.includes("normal")) {
      return "text-green-600";
    } else if (result.includes("severely")) {
      return "text-red-600";
    } else {
      return "text-orange-600";
    }
  };

  // Show error message if there is an error
  if (error) {
    return (
      <div className="poppins p-4 max-w-4xl mx-auto">
        <ToggleMenuPanel />
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-8"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
        <button className="mt-4 btn-primary" onClick={handleGoBack}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Show loading state if result is not yet loaded
  if (!result) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <ToggleMenuPanel />
        <div className="bg-white rounded-3xl p-8 drop-shadow-xs flex justify-center items-center min-h-[400px] mt-8">
          <div className="animate-pulse flex flex-col items-center">
            <div className="rounded-full bg-blue-200 h-16 w-16 mb-4 flex items-center justify-center">
              <i className="fa-solid fa-spinner text-blue text-2xl"></i>
            </div>
            <div className="poppins text-lg font-medium text-gray-700">
              Loading prediction result...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main component render
  return (
    <div className="p-4 mx-auto">
      {/* Top navigation bar */}
      <ToggleMenuPanel />
      <div className="flex justify-between items-center mt-8 mb-6 max-w-5xl mx-auto">
        <div className="poppins text-xl font-medium ml-2">
          <span className="mr-1">
            <i className="fa-solid fa-tooth text-blue"></i>
          </span>
          <span className="poppins heading-text"> Canine Analysis Results</span>
        </div>
        <div className="flex gap-4">
          <button
            className="rounded-lg btn-primary flex items-center"
            onClick={handleGoBack}
          >
            <span>
              <i className="fa-solid fa-arrow-left mr-2"></i>
            </span>
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Main Results Panel */}
      <div className="bg-white rounded-3xl p-4 lg:p-8 drop-shadow-xs max-w-5xl mx-auto">
        {/* Warning message if analysis has a warning */}
        {result.analysis?.warning && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <i className="fa-solid fa-triangle-exclamation text-yellow-400"></i>
              </div>
              <div className="ml-3">
                <p className="poppins text-sm text-yellow-700">
                  <strong>Warning:</strong> {result.analysis.warning}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Note message if analysis has a note */}
        {result.analysis?.note && (
          <div className="mb-6 bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <i className="fa-solid fa-circle-info text-blue-400"></i>
              </div>
              <div className="ml-3">
                <p className="poppins text-sm text-blue-700">
                  <strong>Note:</strong> {result.analysis.note}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Images Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Original image */}
          <div className="border rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="poppins text-lg font-medium">Original X-ray</div>
              <div className="flex gap-2">
                {/* Interactive View button - Opens fullscreen modal with interactive measurements */}
                <button
                  className="text-sm px-3 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    openInteractiveModal();
                  }}
                >
                  <i className="fa-solid fa-wand-magic-sparkles mr-1"></i>
                  Interactive View
                </button>

                {/* Full Size button - Opens image in full size modal */}
                <button
                  className="text-sm px-3 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    openImageModal(originalImage, "Original X-ray");
                  }}
                >
                  <i className="fa-solid fa-expand mr-1"></i> Full Size
                </button>
              </div>
            </div>
            <div className="relative flex justify-center">
              {/* Original image - Clicking opens full size view */}
              <img
                src={originalImage}
                alt="Original X-ray"
                className="max-h-80 object-contain hover:opacity-90 transition-opacity cursor-pointer"
                onClick={() => openImageModal(originalImage, "Original X-ray")}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/image-error.png";
                }}
              />

              {/* Small hint overlay */}
              <div className="absolute bottom-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full opacity-70 hover:opacity-100 transition-opacity">
                <i className="fa-solid fa-wand-magic-sparkles mr-1"></i>
                Click "Interactive View" for analysis
              </div>
            </div>
          </div>

          {/* Result image with keypoints */}
          <div className="border rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="poppins text-lg font-medium">
                Keypoint Detection
              </div>
              <button
                className="text-sm px-3 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  openImageModal(resultImage, "Keypoint Detection");
                }}
              >
                <i className="fa-solid fa-expand mr-1"></i> Full Size
              </button>
            </div>
            <div className="flex justify-center">
              <img
                src={resultImage}
                alt="Analysis with keypoints"
                className="max-h-80 object-contain hover:opacity-90 transition-opacity cursor-pointer"
                onClick={() =>
                  openImageModal(resultImage, "Keypoint Detection")
                }
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/image-error.png";
                }}
              />
            </div>
          </div>
        </div>

        {/* Segmentation Image (if available) */}
        {segmentationImage && (
          <div className="mt-6">
            <div className="border rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="poppins text-lg font-medium">
                  Tooth Segmentation
                </div>
                <button
                  className="text-sm px-3 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    openImageModal(segmentationImage, "Tooth Segmentation");
                  }}
                >
                  <i className="fa-solid fa-expand mr-1"></i> Full Size
                </button>
              </div>
              <div className="flex justify-center">
                <img
                  src={segmentationImage}
                  alt="Tooth segmentation"
                  className="max-h-80 object-contain hover:opacity-90 transition-opacity cursor-pointer"
                  onClick={() =>
                    openImageModal(segmentationImage, "Tooth Segmentation")
                  }
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/image-error.png";
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Dental Overlay Image (if available) */}
        {dentalOverlayImage && (
          <div className="mt-6">
            <div className="border rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="poppins text-lg font-medium">
                  ROI-Guided Dental Overlay
                </div>
                <button
                  className="text-sm px-3 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    openImageModal(dentalOverlayImage, "ROI-Guided Dental Overlay");
                  }}
                >
                  <i className="fa-solid fa-expand mr-1"></i> Full Size
                </button>
              </div>
              <div className="flex justify-center">
                <img
                  src={dentalOverlayImage}
                  alt="Dental overlay"
                  className="max-h-80 object-contain hover:opacity-90 transition-opacity cursor-pointer"
                  onClick={() => openImageModal(dentalOverlayImage, "ROI-Guided Dental Overlay")}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/image-error.png";
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Prediction Summary */}
        <div className="mt-8 border rounded-xl p-6">
          <div className="poppins text-lg font-medium mb-4">
            Prediction Summary
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Result */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="poppins text-gray-500 text-sm mb-2">
                Canine Status
              </div>
              <div
                className={`poppins font-medium text-lg ${getPredictionColor(result.prediction_result)}`}
              >
                {formatPredictionResult(result.prediction_result)}
              </div>
              <div className="poppins mt-2">
                {result.prediction_result.includes("impacted") ? (
                  <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-1 rounded">
                    <i className="fa-solid fa-triangle-exclamation mr-1"></i>{" "}
                    Needs attention
                  </span>
                ) : (
                  <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded">
                    <i className="fa-solid fa-check mr-1"></i> Normal
                  </span>
                )}
              </div>
            </div>

            {/* Confidence Score */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="poppins text-gray-500 text-sm mb-2">
                Analysis Confidence
              </div>
              <div className="flex items-center">
                <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                  <div
                    className={`h-2.5 rounded-full ${
                      result.confidence_score > 0.7
                        ? "bg-green-500"
                        : result.confidence_score > 0.5
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.round(result.confidence_score * 100)}%`,
                    }}
                  ></div>
                </div>
                <span className="poppins text-sm font-medium">
                  {Math.round(result.confidence_score * 100)}%
                </span>
              </div>
              <div className="poppins mt-2 text-xs text-gray-500">
                Based on keypoint detection quality
              </div>
            </div>

            {/* Analysis Date */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="poppins text-gray-500 text-sm mb-2">
                Analysis Date
              </div>
              <div className="poppins font-medium">
                {formatDate(result.created_at)}
              </div>
              <div className="poppins mt-2 text-xs text-gray-500">
                <i className="fa-solid fa-calendar mr-1"></i> Generated report
              </div>
            </div>
          </div>
        </div>

        {/* Preview Analysis Section (shown when editing) */}
        {isEditingKeypoints && previewResult && previewResult.analysis && (
          <div className="mt-8 border-2 border-blue-300 rounded-xl p-6 bg-blue-50">
            <div className="poppins text-lg font-medium mb-4 text-blue-700">
              <i className="fa-solid fa-eye mr-2"></i>
              Preview: Detailed Dental Analysis (Not Saved Yet)
            </div>
            {/* Use previewResult for display - copy all sections from Detailed Analysis */}
            {(() => {
              const displayResult = previewResult;
              return (
                <>
                  {/* ROI Classification Summary */}
                  {displayResult.analysis.roi && (
                    <div className="mb-6">
                      <div className="poppins font-medium text-base mb-2">
                        ROI Classification (Impaction)
                      </div>
                      <div className="bg-white p-4 rounded-lg">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="poppins font-medium">Used Source:</div>
                          <div className="poppins col-span-2 capitalize">
                            {displayResult.analysis.roi.used_source || "-"}
                          </div>

                          <div className="poppins font-medium">Impacted sides:</div>
                          <div className="poppins col-span-2">
                            {displayResult.analysis.roi.impacted_sides &&
                            displayResult.analysis.roi.impacted_sides.length > 0
                              ? displayResult.analysis.roi.impacted_sides.join(", ")
                              : "None"}
                          </div>

                          {/* Per-side probabilities */}
                          {displayResult.analysis.roi.sides && (
                            <>
                              {Object.entries(displayResult.analysis.roi.sides).map(
                                ([side, info]) => (
                                  <div key={side} className="col-span-3">
                                    <div className="flex items-center justify-between">
                                      <div className="poppins font-medium capitalize">
                                        {side} probability
                                      </div>
                                      <div
                                        className={`poppins text-sm font-medium ${
                                          info.impacted
                                            ? "text-red-600"
                                            : "text-green-600"
                                        }`}
                                      >
                                        {info.impacted ? "Impacted" : "Normal"}
                                      </div>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                      <div
                                        className={`h-2.5 rounded-full ${
                                          info.prob >= (displayResult.analysis.roi?.threshold ?? 0.5)
                                            ? "bg-red-500"
                                            : "bg-green-500"
                                        }`}
                                        style={{ width: `${Math.round(info.prob * 100)}%` }}
                                      ></div>
                                    </div>
                                    <div className="poppins text-xs text-gray-500 mt-1">
                                      {Math.round(info.prob * 100)}%
                                    </div>
                                  </div>
                                ),
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Legacy Sector Analysis */}
                  {displayResult.analysis.sector_analysis && (
                    <div className="mb-6">
                      <div className="poppins font-medium text-base mb-2">
                        Sector Analysis
                      </div>
                      <div className="bg-white p-4 rounded-lg">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="poppins font-medium">Sector:</div>
                          <div className="poppins">
                            Sector {displayResult.analysis.sector_analysis.sector}
                          </div>

                          <div className="poppins font-medium">Impaction Type:</div>
                          <div className="poppins font-medium">
                            {displayResult.analysis.sector_analysis.impaction_type ===
                            "Palatally impact" ? (
                              <span className="poppins text-red-600">
                                {displayResult.analysis.sector_analysis.impaction_type}
                              </span>
                            ) : displayResult.analysis.sector_analysis.impaction_type ===
                              "Mid-alveolar" ? (
                              <span className="poppins text-orange-600">
                                {displayResult.analysis.sector_analysis.impaction_type}
                              </span>
                            ) : (
                              <span>
                                {displayResult.analysis.sector_analysis.impaction_type}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Legacy Canine Assessment */}
                  {displayResult.analysis.canine_assessment && (
                    <div className="mb-6">
                      <h4 className="poppins font-medium text-base mb-2">
                        Canine Assessment
                      </h4>
                      <div className="bg-white p-4 rounded-lg">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="poppins font-medium">
                            Overlap with Lateral Incisor:
                          </div>
                          <div
                            className={
                              displayResult.analysis.canine_assessment.overlap === "Yes"
                                ? "poppins text-red-600"
                                : "poppins text-green-600"
                            }
                          >
                            {displayResult.analysis.canine_assessment.overlap}
                          </div>

                          <div className="poppins font-medium">Vertical Height:</div>
                          <div
                            className={
                              displayResult.analysis.canine_assessment.vertical_height.includes(
                                "Beyond",
                              )
                                ? "poppins text-red-600"
                                : "poppins text-green-600"
                            }
                          >
                            {displayResult.analysis.canine_assessment.vertical_height}
                          </div>

                          <div className="poppins font-medium">Root Position:</div>
                          <div
                            className={
                              displayResult.analysis.canine_assessment.root_position.includes(
                                "Above",
                              )
                                ? "poppins text-green-600"
                                : "poppins text-red-600"
                            }
                          >
                            {displayResult.analysis.canine_assessment.root_position}
                          </div>

                          <div className="font-medium">Eruption Assessment:</div>
                          <div
                            className={`font-medium ${
                              displayResult.analysis.canine_assessment
                                .eruption_difficulty === "Unfavorable"
                                ? "poppins text-red-600"
                                : "poppins text-green-600"
                            }`}
                          >
                            {displayResult.analysis.canine_assessment.eruption_difficulty}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Legacy Angle Measurements */}
                  {displayResult.analysis.angle_measurements &&
                    Object.keys(displayResult.analysis.angle_measurements).length > 0 && (
                      <div className="mb-6">
                        <h4 className="poppins font-medium text-base mb-2">
                          Angle and Linear Measurements
                        </h4>
                        <div className="bg-white p-4 rounded-lg">
                          <div className="grid grid-cols-3 gap-4">
                            {displayResult.analysis.angle_measurements
                              .angle_with_midline && (
                              <>
                                <div className="poppins font-medium">
                                  Angle with Midline:
                                </div>
                                <div className="poppins">
                                  {displayResult.analysis.angle_measurements.angle_with_midline.value.toFixed(
                                    2,
                                  )}
                                  °
                                </div>
                                <div
                                  className={`poppins font-medium ${
                                    displayResult.analysis.angle_measurements
                                      .angle_with_midline.difficulty === "Unfavorable"
                                      ? "poppins text-red-600"
                                      : "poppins text-green-600"
                                  }`}
                                >
                                  {
                                    displayResult.analysis.angle_measurements
                                      .angle_with_midline.difficulty
                                  }
                                  {displayResult.analysis.angle_measurements
                                    .angle_with_midline.difficulty === "Unfavorable" &&
                                    " (>31°)"}
                                </div>
                              </>
                            )}

                            {displayResult.analysis.angle_measurements
                              .angle_with_lateral && (
                              <>
                                <div className="poppins font-medium">
                                  Angle with Lateral Incisor:
                                </div>
                                <div className="poppins">
                                  {displayResult.analysis.angle_measurements.angle_with_lateral.value.toFixed(
                                    2,
                                  )}
                                  °
                                </div>
                                <div
                                  className={`poppins font-medium ${
                                    displayResult.analysis.angle_measurements
                                      .angle_with_lateral.difficulty === "Unfavorable"
                                      ? "poppins text-red-600"
                                      : "poppins text-green-600"
                                  }`}
                                >
                                  {
                                    displayResult.analysis.angle_measurements
                                      .angle_with_lateral.difficulty
                                  }
                                  {displayResult.analysis.angle_measurements
                                    .angle_with_lateral.difficulty === "Unfavorable" &&
                                    " (>51.47°)"}
                                </div>
                              </>
                            )}

                            {displayResult.analysis.angle_measurements
                              .angle_with_occlusal && (
                              <>
                                <div className="poppins font-medium">
                                  Angle with Occlusal Plane:
                                </div>
                                <div className="poppins">
                                  {displayResult.analysis.angle_measurements.angle_with_occlusal.value.toFixed(
                                    2,
                                  )}
                                  °
                                </div>
                                <div
                                  className={`poppins font-medium ${
                                    displayResult.analysis.angle_measurements
                                      .angle_with_occlusal.difficulty === "Unfavorable"
                                      ? "poppins text-red-600"
                                      : "poppins text-green-600"
                                  }`}
                                >
                                  {
                                    displayResult.analysis.angle_measurements
                                      .angle_with_occlusal.difficulty
                                  }
                                  {displayResult.analysis.angle_measurements
                                    .angle_with_occlusal.difficulty === "Unfavorable" &&
                                    " (>132°)"}
                                </div>
                              </>
                            )}

                            {displayResult.analysis.angle_measurements
                              .distance_to_occlusal !== undefined && (
                              <>
                                <div className="poppins font-medium">
                                  Distance to Occlusal Plane:
                                </div>
                                <div className="poppins col-span-2">
                                  {displayResult.analysis.angle_measurements.distance_to_occlusal.toFixed(
                                    4,
                                  ) + " pixel"}
                                </div>
                              </>
                            )}

                            {displayResult.analysis.angle_measurements
                              .distance_to_midline !== undefined && (
                              <>
                                <div className="poppins font-medium">
                                  Distance to Midline:
                                </div>
                                <div className="poppins col-span-2">
                                  {displayResult.analysis.angle_measurements.distance_to_midline.toFixed(
                                    4,
                                  ) + " pixel"}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  {/* ROI-based Dental Analysis */}
                  {displayResult.analysis.dental_analysis && (
                    <div className="mt-8">
                      <div className="poppins text-lg font-medium mb-2">
                        ROI-based Dental Analysis
                      </div>
                      <div className="bg-white p-4 rounded-lg">
                        {(() => {
                          const dental = displayResult.analysis.dental_analysis as DentalAnalysis;
                          const sides: Array<'right'|'left'> = ['right','left'].filter((s) => (dental as any)[s]) as any;
                          if (sides.length === 0) {
                            return <div className="text-gray-600">No ROI-based analysis available.</div>;
                          }
                          return (
                            <div className={`grid gap-6 ${sides.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                              {sides.map((side) => {
                                const sideData = (dental as any)[side] as DentalSide;
                                return (
                                  <div key={side} className="border rounded-lg p-4">
                                    <div className="poppins font-medium mb-3 capitalize">{side} side</div>
                                    {sideData.skipped ? (
                                      <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                                        <div className="text-yellow-700">
                                          <i className="fa-solid fa-triangle-exclamation mr-2"></i>
                                          Skipped analysis for this side: {sideData.reason || 'Unknown reason'}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-4">
                                        {sideData.sector_classification && (
                                          <div>
                                            <div className="poppins font-medium text-sm text-gray-600 mb-1">Sector Classification</div>
                                            <div className="poppins">
                                              Sector {sideData.sector_classification.sector} - {sideData.sector_classification.type}
                                            </div>
                                          </div>
                                        )}
                                        {sideData.assessment && (
                                          <div>
                                            <div className="poppins font-medium text-sm text-gray-600 mb-1">Assessment</div>
                                            <div className="poppins text-sm">
                                              {sideData.assessment}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Prediction Result Preview */}
                  <div className="mb-6 mt-6">
                    <div className="poppins font-medium text-base mb-2">
                      Prediction Result
                    </div>
                    <div className="bg-white p-4 rounded-lg">
                      <div className="poppins text-lg font-semibold capitalize">
                        {displayResult.prediction_result || "Unknown"}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Detailed Analysis Section */}
        {result.analysis && (
          <div className="mt-8 border rounded-xl p-6">
            <div className="poppins text-lg font-medium mb-4">
              {isEditingKeypoints && previewResult ? "Current Saved Analysis" : "Detailed Dental Analysis"}
            </div>

            {/* ROI Classification Summary */}
            {result.analysis.roi && (
              <div className="mb-6">
                <div className="poppins font-medium text-base mb-2">
                  ROI Classification (Impaction)
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="poppins font-medium">Used Source:</div>
                    <div className="poppins col-span-2 capitalize">
                      {result.analysis.roi.used_source || "-"}
                    </div>

                    <div className="poppins font-medium">Impacted sides:</div>
                    <div className="poppins col-span-2">
                      {result.analysis.roi.impacted_sides &&
                      result.analysis.roi.impacted_sides.length > 0
                        ? result.analysis.roi.impacted_sides.join(", ")
                        : "None"}
                    </div>

                    {/* Per-side probabilities */}
                    {result.analysis.roi.sides && (
                      <>
                        {Object.entries(result.analysis.roi.sides).map(
                          ([side, info]) => (
                            <div key={side} className="col-span-3">
                              <div className="flex items-center justify-between">
                                <div className="poppins font-medium capitalize">
                                  {side} probability
                                </div>
                                <div
                                  className={`poppins text-sm font-medium ${
                                    info.impacted
                                      ? "text-red-600"
                                      : "text-green-600"
                                  }`}
                                >
                                  {info.impacted ? "Impacted" : "Normal"}
                                </div>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                <div
                                  className={`h-2.5 rounded-full ${
                                    info.prob >= (result.analysis.roi?.threshold ?? 0.5)
                                      ? "bg-red-500"
                                      : "bg-green-500"
                                  }`}
                                  style={{ width: `${Math.round(info.prob * 100)}%` }}
                                ></div>
                              </div>
                              <div className="poppins text-xs text-gray-500 mt-1">
                                {Math.round(info.prob * 100)}%
                              </div>
                            </div>
                          ),
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Legacy Sector Analysis (kept for backward compatibility) */}
            {result.analysis.sector_analysis && (
              <div className="mb-6">
                <div className="poppins font-medium text-base mb-2">
                  Sector Analysis
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="poppins font-medium">Sector:</div>
                    <div className="poppins">
                      Sector {result.analysis.sector_analysis.sector}
                    </div>

                    <div className="poppins font-medium">Impaction Type:</div>
                    <div className="poppins font-medium">
                      {result.analysis.sector_analysis.impaction_type ===
                      "Palatally impact" ? (
                        <span className="poppins text-red-600">
                          {result.analysis.sector_analysis.impaction_type}
                        </span>
                      ) : result.analysis.sector_analysis.impaction_type ===
                        "Mid-alveolar" ? (
                        <span className="poppins text-orange-600">
                          {result.analysis.sector_analysis.impaction_type}
                        </span>
                      ) : (
                        <span>
                          {result.analysis.sector_analysis.impaction_type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Legacy Canine Assessment (kept for backward compatibility) */}
            {result.analysis.canine_assessment && (
              <div className="mb-6">
                <h4 className="poppins font-medium text-base mb-2">
                  Canine Assessment
                </h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="poppins font-medium">
                      Overlap with Lateral Incisor:
                    </div>
                    <div
                      className={
                        result.analysis.canine_assessment.overlap === "Yes"
                          ? "poppins text-red-600"
                          : "poppins text-green-600"
                      }
                    >
                      {result.analysis.canine_assessment.overlap}
                    </div>

                    <div className="poppins font-medium">Vertical Height:</div>
                    <div
                      className={
                        result.analysis.canine_assessment.vertical_height.includes(
                          "Beyond",
                        )
                          ? "poppins text-red-600"
                          : "poppins text-green-600"
                      }
                    >
                      {result.analysis.canine_assessment.vertical_height}
                    </div>

                    <div className="poppins font-medium">Root Position:</div>
                    <div
                      className={
                        result.analysis.canine_assessment.root_position.includes(
                          "Above",
                        )
                          ? "poppins text-green-600"
                          : "poppins text-red-600"
                      }
                    >
                      {result.analysis.canine_assessment.root_position}
                    </div>

                    <div className="font-medium">Eruption Assessment:</div>
                    <div
                      className={`font-medium ${
                        result.analysis.canine_assessment
                          .eruption_difficulty === "Unfavorable"
                          ? "poppins text-red-600"
                          : "poppins text-green-600"
                      }`}
                    >
                      {result.analysis.canine_assessment.eruption_difficulty}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Legacy Angle Measurements (kept for backward compatibility) */}
            {result.analysis.angle_measurements &&
              Object.keys(result.analysis.angle_measurements).length > 0 && (
                <div className="mb-6">
                  <h4 className="poppins font-medium text-base mb-2">
                    Angle and Linear Measurements
                  </h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-3 gap-4">
                      {result.analysis.angle_measurements
                        .angle_with_midline && (
                        <>
                          <div className="poppins font-medium">
                            Angle with Midline:
                          </div>
                          <div className="poppins">
                            {result.analysis.angle_measurements.angle_with_midline.value.toFixed(
                              2,
                            )}
                            °
                          </div>
                          <div
                            className={`poppins font-medium ${
                              result.analysis.angle_measurements
                                .angle_with_midline.difficulty === "Unfavorable"
                                ? "poppins text-red-600"
                                : "poppins text-green-600"
                            }`}
                          >
                            {
                              result.analysis.angle_measurements
                                .angle_with_midline.difficulty
                            }
                            {result.analysis.angle_measurements
                              .angle_with_midline.difficulty === "Unfavorable" &&
                              " (>31°)"}
                          </div>
                        </>
                      )}

                      {result.analysis.angle_measurements
                        .angle_with_lateral && (
                        <>
                          <div className="poppins font-medium">
                            Angle with Lateral Incisor:
                          </div>
                          <div className="poppins">
                            {result.analysis.angle_measurements.angle_with_lateral.value.toFixed(
                              2,
                            )}
                            °
                          </div>
                          <div
                            className={`poppins font-medium ${
                              result.analysis.angle_measurements
                                .angle_with_lateral.difficulty === "Unfavorable"
                                ? "poppins text-red-600"
                                : "poppins text-green-600"
                            }`}
                          >
                            {
                              result.analysis.angle_measurements
                                .angle_with_lateral.difficulty
                            }
                            {result.analysis.angle_measurements
                              .angle_with_lateral.difficulty === "Unfavorable" &&
                              " (>51.47°)"}
                          </div>
                        </>
                      )}

                      {result.analysis.angle_measurements
                        .angle_with_occlusal && (
                        <>
                          <div className="poppins font-medium">
                            Angle with Occlusal Plane:
                          </div>
                          <div className="poppins">
                            {result.analysis.angle_measurements.angle_with_occlusal.value.toFixed(
                              2,
                            )}
                            °
                          </div>
                          <div
                            className={`poppins font-medium ${
                              result.analysis.angle_measurements
                                .angle_with_occlusal.difficulty === "Unfavorable"
                                ? "poppins text-red-600"
                                : "poppins text-green-600"
                            }`}
                          >
                            {
                              result.analysis.angle_measurements
                                .angle_with_occlusal.difficulty
                            }
                            {result.analysis.angle_measurements
                              .angle_with_occlusal.difficulty === "Unfavorable" &&
                              " (>132°)"}
                          </div>
                        </>
                      )}

                      {result.analysis.angle_measurements
                        .distance_to_occlusal !== undefined && (
                        <>
                          <div className="poppins font-medium">
                            Distance to Occlusal Plane:
                          </div>
                          <div className="poppins col-span-2">
                            {result.analysis.angle_measurements.distance_to_occlusal.toFixed(
                              4,
                            ) + " pixel"}
                          </div>
                        </>
                      )}

                      {result.analysis.angle_measurements
                        .distance_to_midline !== undefined && (
                        <>
                          <div className="poppins font-medium">
                            Distance to Midline:
                          </div>
                          <div className="poppins col-span-2">
                            {result.analysis.angle_measurements.distance_to_midline.toFixed(
                              4,
                            ) + " pixel"}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* ROI-based Dental Analysis */}
            {result.analysis.dental_analysis && (
              <div className="mt-8">
                <div className="poppins text-lg font-medium mb-2">
                  ROI-based Dental Analysis
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  {(() => {
                    const dental = result.analysis.dental_analysis as DentalAnalysis;
                    const sides: Array<'right'|'left'> = ['right','left'].filter((s) => (dental as any)[s]) as any;
                    if (sides.length === 0) {
                      return <div className="text-gray-600">No ROI-based analysis available.</div>;
                    }
                    return (
                      <div className={`grid gap-6 ${sides.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                        {sides.map((side) => {
                          const sideData = (dental as any)[side] as DentalSide;
                          return (
                            <div key={side} className="border rounded-lg p-4">
                              <div className="poppins font-medium mb-3 capitalize">{side} side</div>
                              {sideData.skipped ? (
                                <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                                  <div className="text-yellow-700">
                                    <i className="fa-solid fa-triangle-exclamation mr-2"></i>
                                    Skipped analysis for this side: {sideData.reason || 'Unknown reason'}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {sideData.sector_classification && (
                                    <div>
                                      <div className="poppins font-medium text-base mb-2">Sector Analysis</div>
                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="poppins font-medium">Sector:</div>
                                        <div className="poppins">Sector {sideData.sector_classification.sector}</div>
                                        <div className="poppins font-medium">Impaction Type:</div>
                                        <div className="poppins font-medium">
                                          {sideData.sector_classification.impaction_type === 'Palatal' ? (
                                            <span className="poppins text-red-600">{sideData.sector_classification.impaction_type}</span>
                                          ) : sideData.sector_classification.impaction_type === 'Mid-alveolar' ? (
                                            <span className="poppins text-orange-600">{sideData.sector_classification.impaction_type}</span>
                                          ) : (
                                            <span>{sideData.sector_classification.impaction_type}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {sideData.three_factor_assessment && (
                                    <div>
                                      <div className="poppins font-medium text-base mb-2">Three-factor Assessment</div>
                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="poppins font-medium">Overlap with Lateral:</div>
                                        <div className={sideData.three_factor_assessment.overlap_with_lateral === 'Yes' ? 'poppins text-red-600' : 'poppins text-green-600'}>
                                          {sideData.three_factor_assessment.overlap_with_lateral}
                                        </div>
                                        <div className="poppins font-medium">Vertical Height:</div>
                                        <div className={sideData.three_factor_assessment.vertical_height.includes('Difficult') ? 'poppins text-red-600' : 'poppins text-green-600'}>
                                          {sideData.three_factor_assessment.vertical_height}
                                        </div>
                                        <div className="poppins font-medium">Root Apex Position:</div>
                                        <div className={sideData.three_factor_assessment.root_apex_position.includes('Easy') ? 'poppins text-green-600' : 'poppins text-red-600'}>
                                          {sideData.three_factor_assessment.root_apex_position}
                                        </div>
                                        <div className="poppins font-medium">Eruption Difficulty:</div>
                                        <div className={sideData.three_factor_assessment.eruption_difficulty === 'Difficult' ? 'poppins text-red-600 font-medium' : 'poppins text-green-600 font-medium'}>
                                          {sideData.three_factor_assessment.eruption_difficulty}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {sideData.angles_and_distances && (
                                    <div>
                                      <div className="poppins font-medium text-base mb-2">Angles and Distances</div>
                                      <div className="grid grid-cols-3 gap-4">
                                        {sideData.angles_and_distances.angle_with_midline && (
                                          <>
                                            <div className="poppins font-medium">Angle with Midline:</div>
                                            <div className="poppins">{sideData.angles_and_distances.angle_with_midline.value.toFixed(2)}°</div>
                                            <div className={`poppins font-medium ${sideData.angles_and_distances.angle_with_midline.difficulty === 'Difficult' ? 'poppins text-red-600' : 'poppins text-green-600'}`}>
                                              {sideData.angles_and_distances.angle_with_midline.difficulty}
                                            </div>
                                          </>
                                        )}

                                        {sideData.angles_and_distances.angle_with_lateral && (
                                          <>
                                            <div className="poppins font-medium">Angle with Lateral Incisor:</div>
                                            <div className="poppins">{sideData.angles_and_distances.angle_with_lateral.value.toFixed(2)}°</div>
                                            <div className={`poppins font-medium ${sideData.angles_and_distances.angle_with_lateral.difficulty === 'Difficult' ? 'poppins text-red-600' : 'poppins text-green-600'}`}>
                                              {sideData.angles_and_distances.angle_with_lateral.difficulty}
                                            </div>
                                          </>
                                        )}

                                        {sideData.angles_and_distances.angle_with_occlusal && (
                                          <>
                                            <div className="poppins font-medium">Angle with Occlusal Plane:</div>
                                            <div className="poppins">{sideData.angles_and_distances.angle_with_occlusal.value.toFixed(2)}°</div>
                                            <div className={`poppins font-medium ${sideData.angles_and_distances.angle_with_occlusal.difficulty === 'Difficult' ? 'poppins text-red-600' : 'poppins text-green-600'}`}>
                                              {sideData.angles_and_distances.angle_with_occlusal.difficulty}
                                            </div>
                                          </>
                                        )}

                                        {sideData.angles_and_distances.distance_to_occlusal !== undefined && (
                                          <>
                                            <div className="poppins font-medium">Distance to Occlusal Plane:</div>
                                            <div className="poppins col-span-2">{sideData.angles_and_distances.distance_to_occlusal?.toFixed(2)} pixel</div>
                                          </>
                                        )}

                                        {sideData.angles_and_distances.distance_to_midline !== undefined && (
                                          <>
                                            <div className="poppins font-medium">Distance to Midline:</div>
                                            <div className="poppins col-span-2">{sideData.angles_and_distances.distance_to_midline?.toFixed(2)} pixel</div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Overall Assessment */}
            <div>
              <h4 className="poppins text-blue font-medium text-xl mb-2">
                Overall Assessment
              </h4>
              <div className="bg-blue-light p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div className="poppins font-medium">Difficult Factors:</div>
                  <div>
                    <span
                      className={
                        result.analysis.difficult_factors &&
                        result.analysis.difficult_factors >= 3
                          ? "poppins text-red-600 font-medium"
                          : result.analysis.difficult_factors &&
                              result.analysis.difficult_factors >= 1
                            ? "poppins text-orange-600 font-medium"
                            : "poppins text-green-600 font-medium"
                      }
                    >
                      {result.analysis.difficult_factors || 0}
                    </span>{" "}
                    / 6 factors
                  </div>

                  <div className="poppins font-medium">Final Assessment:</div>
                  <div
                    className={`poppins font-medium ${getPredictionColor(result.analysis.prediction_result)}`}
                  >
                    {formatPredictionResult(result.analysis.prediction_result)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Keypoints Table */}
        <div className="mt-8 border rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="poppins text-lg font-medium">
              Detected Keypoints
            </div>
            {result.keypoints && result.keypoints.length > 0 && (
              <button
                onClick={async () => {
                  if (isEditingKeypoints) {
                    setIsEditingKeypoints(false);
                    setEditedKeypoints([]);
                    setPreviewResult(null);
                  } else {
                    // Check if already corrected before allowing edit
                    try {
                      // Try to start editing - if it fails, it's already corrected
                      setIsEditingKeypoints(true);
                      setEditedKeypoints([...result.keypoints]);
                    } catch (error: any) {
                      if (error.response?.status === 400 && error.response?.data?.message?.includes('already been corrected')) {
                        setHasBeenCorrected(true);
                        alert("This detection has already been corrected. Only one correction is allowed per detection.");
                        return;
                      }
                    }
                  }
                }}
                disabled={hasBeenCorrected}
                className={`px-4 py-2 rounded-lg transition-colors text-sm ${
                  hasBeenCorrected 
                    ? "bg-gray-400 text-white cursor-not-allowed" 
                    : isEditingKeypoints 
                      ? "bg-red-500 text-white hover:bg-red-600" 
                      : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                {hasBeenCorrected 
                  ? "Already Corrected" 
                  : isEditingKeypoints 
                    ? "Cancel Edit" 
                    : "Edit Landmarks"}
              </button>
            )}
          </div>

          {result.keypoints && result.keypoints.length > 0 ? (
            <div className="overflow-auto max-h-64">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-gray-50">
                  <tr>
                    <th className="px-4 py-2">Label</th>
                    <th className="px-4 py-2">Coordinates</th>
                    <th className="px-4 py-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {(isEditingKeypoints ? editedKeypoints : result.keypoints).map((keypoint, index) => (
                    <tr key={index} className="border-b">
                      <td className="px-4 py-2 font-medium">
                        {keypoint.label}
                      </td>
                      <td className="px-4 py-2">
                        {isEditingKeypoints ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={Math.round(keypoint.x)}
                              onChange={(e) => {
                                const newKeypoints = [...editedKeypoints];
                                newKeypoints[index].x = parseFloat(e.target.value) || 0;
                                setEditedKeypoints(newKeypoints);
                              }}
                              className="w-20 px-2 py-1 border rounded text-xs"
                              placeholder="X"
                            />
                            <span>,</span>
                            <input
                              type="number"
                              value={Math.round(keypoint.y)}
                              onChange={(e) => {
                                const newKeypoints = [...editedKeypoints];
                                newKeypoints[index].y = parseFloat(e.target.value) || 0;
                                setEditedKeypoints(newKeypoints);
                              }}
                              className="w-20 px-2 py-1 border rounded text-xs"
                              placeholder="Y"
                            />
                          </div>
                        ) : (
                          `(${Math.round(keypoint.x)}, ${Math.round(keypoint.y)})`
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center">
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mr-2">
                            <div
                              className={`h-1.5 rounded-full ${
                                keypoint.confidence > 0.7
                                  ? "bg-green-500"
                                  : keypoint.confidence > 0.5
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                              }`}
                              style={{
                                width: `${Math.round(keypoint.confidence * 100)}%`,
                              }}
                            ></div>
                          </div>
                          <span className="text-xs">
                            {Math.round(keypoint.confidence * 100)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isEditingKeypoints && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={async () => {
                      setIsSavingKeypoints(true);
                      try {
                        const response = await axiosInstance.put(
                          `/detection/${detectionId}/keypoints`,
                          { keypoints: editedKeypoints }
                        );
                        
                        if (response.data.status === "success") {
                          // Update result with new keypoints and analysis (including ROI and dental_analysis)
                          setResult({
                            ...result,
                            keypoints: response.data.keypoints,
                            result_path: response.data.result_path || result?.result_path,
                            analysis: {
                              ...response.data.analysis,
                              roi: response.data.roi || result?.analysis?.roi,
                              dental_analysis: response.data.dental_analysis || result?.analysis?.dental_analysis,
                            },
                            prediction_result: response.data.prediction_result,
                          });
                          
                          // Update result image if new path is available
                          if (response.data.result_path) {
                            const resultFilename = response.data.result_path;
                            setResultImage(
                              `${axiosInstance.defaults.baseURL}/results/${resultFilename}`,
                            );
                          }
                          
                          setIsEditingKeypoints(false);
                          setEditedKeypoints([]);
                          setPreviewResult(null);
                          setHasBeenCorrected(true);
                          
                          // Show success message (you could add a toast notification here)
                          alert("Landmarks updated and analysis recalculated successfully!");
                        }
                      } catch (error: any) {
                        console.error("Error updating keypoints:", error);
                        const errorMessage = error.response?.data?.message || "Failed to update landmarks";
                        alert(errorMessage);
                        if (errorMessage.includes('already been corrected')) {
                          setHasBeenCorrected(true);
                          setIsEditingKeypoints(false);
                          setEditedKeypoints([]);
                          setPreviewResult(null);
                        }
                      } finally {
                        setIsSavingKeypoints(false);
                      }
                    }}
                    disabled={isSavingKeypoints || hasBeenCorrected}
                    className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isSavingKeypoints ? "Saving..." : "Save & Recalculate"}
                  </button>
                  {isLoadingPreview && (
                    <div className="text-xs text-gray-500 mt-2">
                      <i className="fa-solid fa-spinner fa-spin mr-1"></i>
                      Calculating preview...
                    </div>
                  )}
                  {previewResult && !isLoadingPreview && (
                    <div className="mt-2 text-xs text-green-600">
                      <i className="fa-solid fa-check-circle mr-1"></i>
                      Preview ready - Review results below before saving
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="poppins text-center py-4 text-gray-500">
              No keypoints detected
            </div>
          )}
        </div>

        {/* Clinical Recommendations */}
        <div className="mt-8 border rounded-xl p-6">
          <h3 className="poppins text-lg font-medium mb-4">
            Clinical Recommendations
          </h3>

          {result.prediction_result.includes("impacted") ? (
            <div>
              <p className="poppins mb-3">
                The analysis indicates <strong>canine impaction</strong>.
                Clinical recommendations:
              </p>
              <ul className="poppins list-disc pl-5 space-y-2">
                <li>Comprehensive clinical evaluation by an orthodontist</li>
                <li>
                  Consider additional imaging such as CBCT for 3D assessment
                </li>
                <li>Potential early intervention to guide canine eruption</li>
                <li>Possible extraction of deciduous canine if present</li>
                {result.prediction_result.includes("severely") && (
                  <>
                    <li className="text-red-600 font-medium">
                      Higher difficulty level anticipated for treatment
                    </li>
                    <li className="text-red-600 font-medium">
                      May require surgical exposure and orthodontic traction
                    </li>
                  </>
                )}
              </ul>
              <div className="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                <p className="text-sm text-yellow-700">
                  <strong>Note:</strong> This is an AI-assisted analysis and
                  should be confirmed by a qualified dental professional. Early
                  intervention is key to successful management of impacted
                  canines.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-3">
                The analysis indicates{" "}
                <strong>normal canine positioning</strong>. Recommendations:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Continue routine dental monitoring</li>
                <li>Regular orthodontic check-ups as scheduled</li>
                <li>No immediate intervention needed for the canine</li>
                <li>Maintain good oral hygiene</li>
              </ul>
              <div className="mt-4 p-3 bg-green-50 border-l-4 border-green-500 rounded">
                <p className="text-sm text-green-700">
                  <strong>Note:</strong> While the automated analysis shows
                  normal positioning, continue with regular dental check-ups.
                  This is an AI-assisted analysis and should be confirmed by a
                  qualified dental professional.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Regular Image Modal for viewing full-size images */}
      <ImageModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        imageSrc={modalImage}
        title={modalTitle}
      />

      {/* Interactive Analysis Modal - Fullscreen modal for interactive view */}
      {isInteractiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-light bg-opacity-70 backdrop-blur-sm poppins">
          <div className="bg-white rounded-lg overflow-hidden w-[90vw] h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-xl font-medium">
                Interactive Dental Analysis
              </h3>

              {/* Add side selection if we have multiple sides */}
              {result.analysis?.side_analyses &&
                Object.keys(result.analysis.side_analyses).length > 1 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Side:</span>
                    <div
                      className="inline-flex rounded-md shadow-sm"
                      role="group"
                    >
                      {Object.keys(result.analysis.side_analyses).map(
                        (side) => (
                          <button
                            key={side}
                            type="button"
                            onClick={() => setActiveSide(side)}
                            className={`px-3 py-1 text-sm font-medium ${
                              activeSide === side
                                ? "bg-blue-600 text-white"
                                : "bg-white text-gray-700 hover:bg-gray-50"
                            } border border-gray-200 rounded-md`}
                          >
                            {side.charAt(0).toUpperCase() + side.slice(1)}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}

              <button
                onClick={() => setIsInteractiveModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer"
              >
                <i className="fa-solid fa-times fa-lg"></i>
              </button>
            </div>

            <div className="flex flex-grow overflow-hidden bg-gray-100">
              {/* Sidebar for line visibility controls */}
              <div className="w-64 bg-white border-r p-4 overflow-y-auto">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  <i className="fa-solid fa-eye mr-2"></i>
                  Show/Hide Lines
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={lineVisibility.midline}
                      onChange={(e) =>
                        setLineVisibility({
                          ...lineVisibility,
                          midline: e.target.checked,
                        })
                      }
                      className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Midline</span>
                  </label>
                  <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={lineVisibility.sectorLines}
                      onChange={(e) =>
                        setLineVisibility({
                          ...lineVisibility,
                          sectorLines: e.target.checked,
                        })
                      }
                      className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Sector Lines (L1-L4)</span>
                  </label>
                  <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={lineVisibility.occlusalPlane}
                      onChange={(e) =>
                        setLineVisibility({
                          ...lineVisibility,
                          occlusalPlane: e.target.checked,
                        })
                      }
                      className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Occlusal Plane</span>
                  </label>
                  <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={lineVisibility.canineAxis}
                      onChange={(e) =>
                        setLineVisibility({
                          ...lineVisibility,
                          canineAxis: e.target.checked,
                        })
                      }
                      className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Canine Axis</span>
                  </label>
                  <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={lineVisibility.lateralAxis}
                      onChange={(e) =>
                        setLineVisibility({
                          ...lineVisibility,
                          lateralAxis: e.target.checked,
                        })
                      }
                      className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Lateral Incisor Axis</span>
                  </label>
                  <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={lineVisibility.keypoints}
                      onChange={(e) =>
                        setLineVisibility({
                          ...lineVisibility,
                          keypoints: e.target.checked,
                        })
                      }
                      className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Keypoints</span>
                  </label>
                  <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={lineVisibility.roiBoxes}
                      onChange={(e) =>
                        setLineVisibility({
                          ...lineVisibility,
                          roiBoxes: e.target.checked,
                        })
                      }
                      className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">ROI Boxes</span>
                  </label>
                  <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={lineVisibility.angles}
                      onChange={(e) =>
                        setLineVisibility({
                          ...lineVisibility,
                          angles: e.target.checked,
                        })
                      }
                      className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Angles</span>
                  </label>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <button
                    onClick={() =>
                      setLineVisibility({
                        midline: true,
                        sectorLines: true,
                        occlusalPlane: true,
                        canineAxis: true,
                        lateralAxis: true,
                        keypoints: true,
                        roiBoxes: true,
                        angles: true,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition"
                  >
                    <i className="fa-solid fa-check-double mr-1"></i>
                    Show All
                  </button>
                </div>
              </div>

              {/* Main canvas area */}
              <div className="flex-grow overflow-auto p-4">
                <div className="h-full flex items-center justify-center">
                  <MeasurementCanvasPanel
                    result={isEditingKeypoints && previewResult ? previewResult : result}
                    originalImage={originalImage}
                    fullSize={true}
                    activeSide={activeSide}
                    lineVisibility={lineVisibility}
                    editable={isEditingKeypoints && !hasBeenCorrected}
                    editedKeypoints={isEditingKeypoints && editedKeypoints.length > 0 ? editedKeypoints : undefined}
                    onKeypointsChange={(updatedKeypoints) => {
                      setEditedKeypoints(updatedKeypoints);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t flex justify-between items-center">
              <div className="text-sm text-gray-600">
                <i className="fa-solid fa-info-circle mr-1"></i>
                {isEditingKeypoints ? (
                  <span>Click and drag keypoints to adjust landmarks. Click "Save & Recalculate" when done.</span>
                ) : (
                  <span>Use the sidebar to toggle individual measurement lines on/off.</span>
                )}
              </div>
              <div className="flex gap-2">
                {isEditingKeypoints && (
                  <button
                    onClick={async () => {
                      setIsSavingKeypoints(true);
                      try {
                        const response = await axiosInstance.put(
                          `/detection/${detectionId}/keypoints`,
                          { keypoints: editedKeypoints }
                        );
                        
                        if (response.data.status === "success") {
                          // Update result with new keypoints and analysis (including ROI and dental_analysis)
                          setResult({
                            ...result,
                            keypoints: response.data.keypoints,
                            result_path: response.data.result_path || result?.result_path,
                            analysis: {
                              ...response.data.analysis,
                              roi: response.data.roi || result?.analysis?.roi,
                              dental_analysis: response.data.dental_analysis || result?.analysis?.dental_analysis,
                            },
                            prediction_result: response.data.prediction_result,
                          });
                          
                          // Update result image if new path is available
                          if (response.data.result_path) {
                            const resultFilename = response.data.result_path;
                            setResultImage(
                              `${axiosInstance.defaults.baseURL}/results/${resultFilename}`,
                            );
                          }
                          
                          setIsEditingKeypoints(false);
                          setEditedKeypoints([]);
                          setPreviewResult(null);
                          setHasBeenCorrected(true);
                          alert("Landmarks updated and analysis recalculated successfully!");
                        }
                      } catch (error: any) {
                        console.error("Error updating keypoints:", error);
                        const errorMessage = error.response?.data?.message || "Failed to update landmarks";
                        alert(errorMessage);
                        if (errorMessage.includes('already been corrected')) {
                          setHasBeenCorrected(true);
                          setIsEditingKeypoints(false);
                          setEditedKeypoints([]);
                          setPreviewResult(null);
                        }
                      } finally {
                        setIsSavingKeypoints(false);
                      }
                    }}
                    disabled={isSavingKeypoints || hasBeenCorrected}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                  >
                    {isSavingKeypoints ? "Saving..." : "Save & Recalculate"}
                  </button>
                )}
                {isEditingKeypoints && isLoadingPreview && (
                  <div className="text-xs text-gray-500">
                    <i className="fa-solid fa-spinner fa-spin mr-1"></i>
                    Calculating...
                  </div>
                )}
                {isEditingKeypoints && previewResult && !isLoadingPreview && (
                  <div className="text-xs text-green-600">
                    <i className="fa-solid fa-check-circle mr-1"></i>
                    Preview ready
                  </div>
                )}
                <button
                  onClick={async () => {
                    if (isEditingKeypoints) {
                      setIsEditingKeypoints(false);
                      setEditedKeypoints([]);
                      setPreviewResult(null);
                    } else {
                      try {
                        setIsEditingKeypoints(true);
                        setEditedKeypoints([...result.keypoints]);
                      } catch (error: any) {
                        if (error.response?.status === 400 && error.response?.data?.message?.includes('already been corrected')) {
                          setHasBeenCorrected(true);
                          alert("This detection has already been corrected. Only one correction is allowed per detection.");
                          return;
                        }
                      }
                    }
                  }}
                  disabled={hasBeenCorrected}
                  className={`px-4 py-2 rounded-lg transition-colors text-sm ${
                    hasBeenCorrected 
                      ? "bg-gray-400 text-white cursor-not-allowed" 
                      : isEditingKeypoints 
                        ? "bg-red-500 text-white hover:bg-red-600" 
                        : "bg-blue-500 text-white hover:bg-blue-600"
                  }`}
                >
                  {hasBeenCorrected 
                    ? "Already Corrected" 
                    : isEditingKeypoints 
                      ? "Cancel Edit" 
                      : "Edit Landmarks"}
                </button>
                <button
                  onClick={() => setIsInteractiveModalOpen(false)}
                  className="btn-secondary w-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export PDF button */}
      <div className="mt-8 flex justify-end max-w-5xl mx-auto">
        <button
          onClick={handleExportPDF}
          className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition flex items-center cursor-pointer"
        >
          <i className="fa-solid fa-file-pdf mr-2"></i>
          Export Results as PDF
        </button>
      </div>
    </div>
  );
};

export default PredictionPanel;
