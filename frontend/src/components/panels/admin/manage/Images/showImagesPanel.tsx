import { useEffect, useState } from "react";
import axiosInstance from "../../../../../config/axiosConfig";
import { useLoading } from "../../../../contexts/loadingContext";
import { authUtils } from "../../../../../utils/auth";

interface CorrectedImage {
  id: number;
  detection_id: string;
  user_id: number;
  original_image_path: string;
  corrected_result_path: string | null;
  keypoints: Array<{
    label: string;
    x: number;
    y: number;
    confidence: number;
  }>;
  corrected_at: string;
  notes: string | null;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  pages: number;
}

const ShowImagesPanel = () => {
  const { setLoading } = useLoading();
  const [images, setImages] = useState<CorrectedImage[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    per_page: 20,
    total: 0,
    pages: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<CorrectedImage | null>(null);

  const fetchImages = async (page: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get(`/admin/images`, {
        params: {
          page,
          per_page: pagination.per_page,
        },
      });

      if (response.data.status === "success") {
        setImages(response.data.images);
        setPagination(response.data.pagination);
      } else {
        setError(response.data.message || "Failed to fetch images");
      }
    } catch (err: any) {
      console.error("Error fetching images:", err);
      setError(
        err.response?.data?.message || "Error fetching corrected images"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages(1);
  }, []);

  const handleExportSingle = async (imageId: number) => {
    try {
      const response = await axiosInstance.get(
        `/admin/images/${imageId}/export`,
        {
          responseType: "blob",
        }
      );

      // Create blob and download as ZIP
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `corrected_image_${imageId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Error exporting image:", err);
      alert("Failed to export image data");
    }
  };

  const handleExportAll = async () => {
    try {
      const response = await axiosInstance.get(`/admin/images/export-all`, {
        responseType: "blob",
      });

      // Create blob and download as ZIP
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `all_corrected_images.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Error exporting all images:", err);
      alert("Failed to export all images");
    }
  };

  const handleDelete = async (imageId: number) => {
    if (!confirm("Are you sure you want to delete this corrected image?")) {
      return;
    }

    try {
      const response = await axiosInstance.delete(`/admin/images/${imageId}`);
      if (response.data.status === "success") {
        alert("Image deleted successfully");
        fetchImages(pagination.page);
      } else {
        alert(response.data.message || "Failed to delete image");
      }
    } catch (err: any) {
      console.error("Error deleting image:", err);
      alert(
        err.response?.data?.message || "Failed to delete corrected image"
      );
    }
  };

  const getImageUrl = (filename: string) => {
    // Get token from authUtils (same way axiosInstance does)
    const token = authUtils.getToken();
    if (token) {
      return `${axiosInstance.defaults.baseURL}/admin/corrected-images/${filename}?token=${encodeURIComponent(token)}`;
    }
    // If no token, axios interceptor will add it via Authorization header
    return `${axiosInstance.defaults.baseURL}/admin/corrected-images/${filename}`;
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Corrected Images</h2>
        <div className="flex gap-2">
          <button
            onClick={handleExportAll}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            <i className="fa-solid fa-file-zipper mr-2"></i>
            Export All as ZIP
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {images.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <i className="fa-solid fa-image text-4xl mb-4"></i>
          <p>No corrected images found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {images.map((image) => (
              <div
                key={image.id}
                className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow"
              >
                <div className="relative">
                  {image.original_image_path && (
                    <img
                      src={getImageUrl(image.original_image_path)}
                      alt={`Corrected Image ${image.id}`}
                      className="w-full h-48 object-contain bg-gray-100 cursor-pointer"
                      onClick={() => setSelectedImage(image)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/image-error.png";
                      }}
                    />
                  )}
                  <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                    ID: {image.id}
                  </div>
                </div>
                <div className="p-4">
                  <div className="mb-2">
                    <p className="text-sm text-gray-600">
                      <strong>Detection ID:</strong> {image.detection_id}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Keypoints:</strong> {image.keypoints.length}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Corrected:</strong>{" "}
                      {new Date(image.corrected_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleExportSingle(image.id)}
                      className="flex-1 px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm"
                      title="Export as ZIP (original image + JSON)"
                    >
                      <i className="fa-solid fa-file-zipper mr-1"></i>
                      Export ZIP
                    </button>
                    <button
                      onClick={() => setSelectedImage(image)}
                      className="flex-1 px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm"
                    >
                      <i className="fa-solid fa-eye mr-1"></i>
                      View
                    </button>
                    <button
                      onClick={() => handleDelete(image.id)}
                      className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="mt-6 flex justify-center items-center gap-2">
              <button
                onClick={() => fetchImages(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-4 py-2">
                Page {pagination.page} of {pagination.pages} (Total: {pagination.total})
              </span>
              <button
                onClick={() => fetchImages(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Image Detail Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Image Details</h3>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <i className="fa-solid fa-times text-2xl"></i>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <h4 className="font-semibold mb-2">Original Image</h4>
                  {selectedImage.original_image_path && (
                    <img
                      src={getImageUrl(selectedImage.original_image_path)}
                      alt="Original"
                      className="w-full h-64 object-contain bg-gray-100 rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/image-error.png";
                      }}
                    />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Corrected Result</h4>
                  {selectedImage.corrected_result_path ? (
                    <img
                      src={getImageUrl(selectedImage.corrected_result_path)}
                      alt="Corrected"
                      className="w-full h-64 object-contain bg-gray-100 rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/image-error.png";
                      }}
                    />
                  ) : (
                    <div className="w-full h-64 bg-gray-100 rounded flex items-center justify-center text-gray-500">
                      No corrected result image
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="font-semibold mb-2">Information</h4>
                <div className="bg-gray-50 p-4 rounded">
                  <p><strong>ID:</strong> {selectedImage.id}</p>
                  <p><strong>Detection ID:</strong> {selectedImage.detection_id}</p>
                  <p><strong>User ID:</strong> {selectedImage.user_id}</p>
                  <p>
                    <strong>Corrected At:</strong>{" "}
                    {new Date(selectedImage.corrected_at).toLocaleString()}
                  </p>
                  <p><strong>Keypoints Count:</strong> {selectedImage.keypoints.length}</p>
                </div>
              </div>

              <div className="mb-4">
                <h4 className="font-semibold mb-2">Keypoints</h4>
                <div className="bg-gray-50 p-4 rounded max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Label</th>
                        <th className="text-left p-2">X</th>
                        <th className="text-left p-2">Y</th>
                        <th className="text-left p-2">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedImage.keypoints.map((kp, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">{kp.label}</td>
                          <td className="p-2">{kp.x.toFixed(2)}</td>
                          <td className="p-2">{kp.y.toFixed(2)}</td>
                          <td className="p-2">{(kp.confidence * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleExportSingle(selectedImage.id)}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                  title="Export as ZIP (original image + JSON)"
                >
                  <i className="fa-solid fa-file-zipper mr-2"></i>
                  Export ZIP
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShowImagesPanel;
