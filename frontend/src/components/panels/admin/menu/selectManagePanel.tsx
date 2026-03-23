// Import Styles
import { useState } from "react";
import "./styles/selectManagePanel.css";

interface MenuItem {
  id: string;
  icon?: string;
  label: string;
  children?: MenuItem[];
}

interface SelectManagePanelProps {
  selectedPanel: string;
  setSelectedPanel: (panel: string) => void;
}

const SelectManagePanel = ({
  selectedPanel,
  setSelectedPanel,
}: SelectManagePanelProps) => {
  // Keep track of expanded menu items
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(
    {},
  );

  // Toggle expanded state of a menu item
  const toggleExpand = (menuId: string) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [menuId]: !prev[menuId],
    }));
  };

  // Define menu items
  const menuItems = [
    {
      id: "users",
      icon: "fa-sharp fa-solid fa-users",
      label: "Users",
      children: [
        { id: "users-list", label: "User List" },
        { id: "users-create", label: "Create User" },
      ],
    },
    {
      id: "images",
      icon: "fa-solid fa-image",
      label: "Images",
      children: [
        { id: "images-list", label: "Corrected Images" },
      ],
    },
    // Add more items as needed
  ];

  // Check if an item or any of its children is selected
  const isMenuActive = (item: MenuItem): boolean => {
    if (selectedPanel === item.id) return true;
    if (item.children) {
      return item.children.some((child) => selectedPanel === child.id);
    }
    return false;
  };

  return (
    <div className="mt-12">
      {menuItems.map((item) => (
        <div className="mb-6" key={item.id}>
          {/* Main menu item */}
          <div
            className={`poppins heading-text cursor-pointer hover-text-blue flex justify-center px-4 py-2 select-none  ${
              isMenuActive(item) ? "border-l-4 border-blue-500" : ""
            }`}
            onClick={() => {
              if (item.children?.length) {
                toggleExpand(item.id);
              } else {
                setSelectedPanel(item.id);
              }
            }}
          >
            <span className={`menu-selection ${isMenuActive(item) ? "bg-blue-light" : ""}`}>
              {item.icon && (
                <span className="mr-2">
                  <i className={`${item.icon} -translate-y-[1px]`}></i>
                </span>
              )}
              <span className="text-xl mr-4">{item.label}</span>
              {item.children?.length > 0 && (
                <span className="menu-arrow">
                  <i
                    className={`fa-solid ${expandedMenus[item.id] ? "fa-angle-down" : "fa-angle-right"} text-sm`}
                  ></i>
                </span>
              )}
            </span>
          </div>

          {/* Submenu items - only shown when parent is expanded */}
          {item.children && expandedMenus[item.id] && (
            <div className="submenu-container">
              {item.children.map((child) => (
                <div
                  key={child.id}
                  className={`poppins submenu-item hover-text-blue py-2 pr-4 text-center ${
                    selectedPanel === child.id
                      ? "text-blue-500 font-medium cursor-default pointer-events-none "
                      : "text-gray-600 cursor-pointer"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPanel(child.id);
                  }}
                >
                  <span className="text-sm">{child.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SelectManagePanel;
