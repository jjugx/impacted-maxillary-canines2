import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLoading } from "../../contexts/loadingContext";
import ToggleMenuPanel from "../admin/menu/toggleMenuPanel";
import axiosInstance from "../../../config/axiosConfig";
import { authUtils } from "../../../utils/auth";

// Upload image
import upload_image from "/upload_image.svg";

// Import history component
import PredictionHistoryPanel from "./predictionHistoryPanel";
import { AppTutorialModal } from "../../common/AppTutorialModal";

const Dashboard = () => {
  const { setLoading } = useLoading();
  const navigate = useNavigate();
  const token = authUtils.getToken();
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 200);
  }, [setLoading]);

  // Set up event listeners for drop zone
  useEffect(() => {
    if (!dropZoneRef.current) return;

    const element = dropZoneRef.current;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];

        if (
          file.type === "image/jpeg" ||
          file.type === "image/png" ||
          file.type === "image/jpg"
        ) {
          setSelectedFile(file);
          setError(null);
        } else {
          setError("Please drop a JPG, JPEG or PNG file.");
        }
      } else if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {

        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          if (e.dataTransfer.items[i].kind === "file") {
            const file = e.dataTransfer.items[i].getAsFile();

            if (file && (
              file.type === "image/jpeg" ||
              file.type === "image/png" ||
              file.type === "image/jpg"
            )) {
              setSelectedFile(file);
              setError(null);
              break;
            } else {
              setError("Please drop a JPG, JPEG or PNG file.");
            }
          }
        }
      } else {
        setError("No files detected in the drop. Please try again or use the browse button.");
      }
    };

    // Register native event listeners to ensure they work
    element.addEventListener('dragenter', handleDragEnter);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop);

    // Clean up
    return () => {
      element.removeEventListener('dragenter', handleDragEnter);
      element.removeEventListener('dragover', handleDragOver);
      element.removeEventListener('dragleave', handleDragLeave);
      element.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // File upload progress
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Error state
  const [error, setError] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // Handle file upload change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Check file type
      if (
        file.type === "image/jpeg" ||
        file.type === "image/png" ||
        file.type === "image/jpg"
      ) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError("Please select a JPG, JPEG or PNG file.");
      }
    }
  };

  // Click browse
  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  // Remove file
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError(null);
    // Reset the file input value so you can upload the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // React drag handlers (fallback)
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];

      if (
        file.type === "image/jpeg" ||
        file.type === "image/png" ||
        file.type === "image/jpg"
      ) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError("Please drop a JPG, JPEG or PNG file.");
      }
    } else if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind === "file") {
          const file = e.dataTransfer.items[i].getAsFile();
          if (file && (
            file.type === "image/jpeg" ||
            file.type === "image/png" ||
            file.type === "image/jpg"
          )) {
            setSelectedFile(file);
            setError(null);
            break;
          } else {
            setError("Please drop a JPG, JPEG or PNG file.");
          }
        }
      }
    } else {
      setError("No files detected in the drop. Please try again or use the browse button.");
    }
  };

  // Predict
  const handlePredict = async () => {
    if (!selectedFile) {
      setError("Please select an image first");
      return;
    }

    try {
      setError(null);
      setIsUploading(true);
      setUploadProgress(0);

      // Create form data
      const formData = new FormData();
      formData.append("image", selectedFile);

      // Send the image to the backend
      const response = await axiosInstance.post("/analyze", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onUploadProgress: (progressEvent: any) => {
          const percentCompleted = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          setUploadProgress(percentCompleted);
        },
      });

      if (response.data.status === "success") {
        // Navigate to the prediction result page
        // Updated to get detection ID from the correct location in the response
        const detectionId = response.data.detection.detection_id;
        navigate(`/prediction/${detectionId}`);
      } else {
        throw new Error(response.data.message || "Failed to process image");
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error("Prediction error:", err);
      let errorMessage = "An error occurred while processing the image";

      // Extract error message from response if available
      if (err.response && err.response.data && err.response.data.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4">
      <ToggleMenuPanel />
      {/* <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8 lg:mt-12 max-w-4xl mx-auto px-2">
        <div className="poppins font-medium heading-text text-xl lg:text-2xl text-center">
          <span className="mr-2">
            <i className="fa-sharp fa-solid fa-stars text-blue fa-lg -translate-y-1"></i>
          </span>
          <span>AI for prediction of maxillary impacted canine</span>
        </div>
        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          className="shrink-0 rounded-lg btn-secondary flex items-center text-sm px-3 py-2"
        >
          <i className="fa-solid fa-circle-question mr-2"></i>
          User guide
        </button>
      </div> */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mt-8 lg:mt-12 max-w-7xl mx-auto px-4 w-full">
        
        {/* 1. ฝั่งซ้าย: พื้นที่ว่างเพื่อ Balance */}
        <div className="hidden sm:block"></div>

        {/* 2. ฝั่งกลาง: หัวข้อหลัก */}
        <div className="poppins font-medium heading-text text-xl lg:text-2xl text-center">
          <div className="flex items-center justify-center">
            <span className="mr-2 shrink-0">
              <i className="fa-sharp fa-solid fa-stars text-blue fa-lg -translate-y-1"></i>
            </span>
            <span className="leading-tight">
              AI for prediction of maxillary impacted canine
            </span>
          </div>
        </div>

        {/* 3. ฝั่งขวา: ปุ่ม User guide (ขนาดเล็กลง + สีเทา) */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
           
            className="shrink-0 rounded-md bg-gray-500 hover:bg-gray-600 text-white flex items-center text-xs px-2 py-1 transition-colors"
          >
            <i className="fa-solid fa-circle-question mr-1.5"></i>
            User guide
          </button>
        </div>
        
      </div>


      {/* Error message */}
      {error && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative max-w-4xl mx-auto mt-8 lg:mt-12"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="mt-8 lg:mt-12">
        <div className="bg-white min-w-lg max-w-4xl mx-auto rounded-3xl p-4 lg:p-8 drop-shadow-xs">
          <div
            ref={dropZoneRef}
            className={`relative border-2 ${
              isDragging ? "border-blue bg-blue-50" : "border-gray-400"
            } border-dashed rounded-lg p-4 lg:p-6 transition-all duration-200`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50 bg-opacity-80 rounded-lg">
                <p className="text-blue-600 font-medium text-lg">Drop your image here</p>
              </div>
            )}

            {isUploading ? (
              <div className="text-center py-8">
                <div className="animate-pulse mb-4">
                  <i className="fa-solid fa-cloud-arrow-up text-blue text-4xl"></i>
                </div>
                <div className="poppins font-medium mb-4">
                  Uploading and analyzing image...
                </div>

                {/* Progress bar */}
                <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <div className="poppins text-sm text-gray-500 mt-2">
                  {uploadProgress}%
                </div>
              </div>
            ) : selectedFile ? (
              <div className="text-center">
                <img
                  src={URL.createObjectURL(selectedFile)}
                  alt="Preview"
                  className="max-h-64 mx-auto object-contain"
                />
                <div className="poppins mt-4 text-gray-500">
                  {selectedFile.name}
                </div>
                <div className="grid grid-cols-2 gap-4 lg:gap-6 mt-4 lg:mt-6">
                  <button
                    className="mt-4 px-4 py-2 rounded-lg btn-secondary"
                    onClick={handleRemoveFile}
                  >
                    Remove Image
                  </button>
                  <button
                    className="mt-4 px-4 py-2 rounded-lg btn-primary"
                    onClick={handlePredict}
                  >
                    <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>
                    Analyze Image
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`w-32 mx-auto cursor-pointer ${isDragging ? "shadow-xl filter drop-shadow-xl transform -translate-y-1" : ""} transition-all duration-300 rounded-xl hover:scale-105`}
                  onClick={handleBrowseClick}
                >
                  <img
                    src={upload_image}
                    alt="Upload"
                    className={`transition-all duration-300 ${isDragging ? "scale-110" : ""}`}
                  />
                </div>
                <div className="poppins font-medium text-lg text-center">
                  <span>Drop image here, or </span>
                  <span
                    className="text-blue cursor-pointer hover:text-blue-500 transition-all duration-200"
                    onClick={handleBrowseClick}
                  >
                    browse
                  </span>
                  <div className="text-gray-400 mt-2 lg:mt-4 text-base">
                    Support JPG, JPEG and PNG
                  </div>
                </div>
              </>
            )}
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".jpg,.jpeg,.png"
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Prediction History Section */}
      <div className="mt-12 max-w-4xl mx-auto">
        <PredictionHistoryPanel />
      </div>

      <AppTutorialModal
        isOpen={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
