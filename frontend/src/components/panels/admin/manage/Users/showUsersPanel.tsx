import { useEffect, useState } from "react";
import axiosInstance from "../../../../../config/axiosConfig";
import axios from "axios";

const ShowUsersPanel = () => {
  // Define User type
  interface User {
    id: number;
    email: string;
    username: string;
    role: string;
  }

  // Define Users
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<{show: boolean, userId: number | null, username: string}>({
    show: false,
    userId: null,
    username: ''
  });

  useEffect(() => {
    axiosInstance.get('/user/all')
      .then((response) => {
        if (response.data.status === 'success') {
          setUsers(response.data.users);
        } else {
          setError("Invalid response from server");
        }
      })
      .catch((error) => {
        if (axios.isAxiosError(error)) {
          if (error.code === "ECONNABORTED" || !error.response) {
            // Connection timeout or server unreachable
            setError("Cannot connect to server.");
          } else {
            // Server responded with an error
            setError(
              error.response?.data?.message || "An error occurred during login",
            );
          }
        } else {
          // Non-axios error
          setError("An unexpected error occurred. Please try again.");
        }
      })
  }, []) // Removed users from dependency array to prevent infinite loop

  // Function to handle delete user
  const handleDeleteUser = async (userId: number) => {
    try {
      const response = await axiosInstance.delete(`/user/${userId}`);
      if (response.data.status === 'success') {
        // Remove user from state
        setUsers(users.filter(user => user.id !== userId));
        setDeleteConfirm({ show: false, userId: null, username: '' });
        setError('');
      } else {
        setError(response.data.message || 'Failed to delete user');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setError(error.response?.data?.message || 'An error occurred while deleting user');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    }
  };

  // Function to show delete confirmation
  const showDeleteConfirm = (userId: number, username: string) => {
    setDeleteConfirm({ show: true, userId, username });
  };

  // Function to cancel delete
  const cancelDelete = () => {
    setDeleteConfirm({ show: false, userId: null, username: '' });
  };

  return (
    <div className="px-8 mt-18">
      <div className="poppins heading-text text-2xl font-medium mb-2 md:mb-3">All Users</div>
      <div className="poppins md:text-sm text-gray-500 mb-4 lg:mb-8">
        Manage all users.
      </div>
      <div className="bg-white grid grid-cols-[minmax(0,_75px)_minmax(0,_1fr)_minmax(0,_1fr)_minmax(0,_1fr)_minmax(50px,_100px)] mt-4 px-4 py-2 rounded-md border-2 border-gray-200">
        <div className="poppins text-center font-medium border-r-2 border-gray-100">
          Id
        </div>
        <div className="poppins text-center font-medium border-r-2 border-gray-100">
          Email
        </div>
        <div className="poppins text-center font-medium border-r-2 border-gray-100">
          Username
        </div>
        <div className="poppins text-center font-medium border-r-2 border-gray-100">
          Role
        </div>
        <div className="poppins text-center font-medium">
          Action
        </div>
      </div>
      {
        users.length > 1 ? (
          users.map((user) => (
            <div key={user.id} className="bg-white grid grid-cols-[minmax(0,_75px)_minmax(0,_1fr)_minmax(0,_1fr)_minmax(0,_1fr)_minmax(50px,_100px)] mt-4 px-4 py-4 rounded-md border-2 border-gray-200 hover:bg-gray-50">
              <div className="poppins text-center text-gray-600 border-r-2 border-gray-100">
                {user.id}
              </div>
              <div className="poppins text-center text-gray-600 border-r-2 border-gray-100">
                {user.email}
              </div>
              <div className="poppins text-center text-gray-600 border-r-2 border-gray-100">
                {user.username}
              </div>
              <div className={`poppins text-center text-gray-600 border-r-2 border-gray-100 ${user.role === 'admin' ? "text-red-500" : "text-blue"}`}>
                {user.role}
              </div>
              <div className="poppins text-center">
                {user.role !== 'admin' && (
                  <button
                    onClick={() => showDeleteConfirm(user.id, user.username)}
                    className="text-red-500 hover:text-red-700 cursor-pointer"
                    title="Delete User"
                  >
                    <i className="fa-solid fa-trash fa-lg"></i>
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div>
            {error && <p className="text-red-500 mt-4">{error}</p>}
          </div>
        )
      }

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <i className="fa-solid fa-exclamation-triangle text-yellow-500 text-2xl mr-3"></i>
              <h3 className="text-lg font-semibold text-gray-900">Confirm User Deletion</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete user <strong>{deleteConfirm.username}</strong>? 
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteConfirm.userId && handleDeleteUser(deleteConfirm.userId)}
                className="px-4 py-2 text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ShowUsersPanel;
