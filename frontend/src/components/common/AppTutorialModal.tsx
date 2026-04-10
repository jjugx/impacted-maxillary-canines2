import React from "react";
import {
  methodologySections,
  tutorialSteps,
} from "../../content/helpContent";

type AppTutorialModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const AppTutorialModal: React.FC<AppTutorialModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 id="tutorial-title" className="poppins text-lg font-semibold">
            User guide & methodology
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 p-2 rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-8 poppins text-sm text-gray-800">
          <section>
            <h3 className="font-semibold text-base mb-3 text-blue-700">
              How to use the app
            </h3>
            <ol className="list-decimal list-inside space-y-3">
              {tutorialSteps.map((step, i) => (
                <li key={i} className="leading-relaxed">
                  <span className="font-medium">{step.title}: </span>
                  {step.text}
                </li>
              ))}
            </ol>
          </section>

          {methodologySections.map((sec, i) => (
            <section key={i}>
              <h3 className="font-semibold text-base mb-3 text-blue-700">
                {sec.title}
              </h3>
              <ul className="space-y-2 list-disc list-inside text-gray-700">
                {sec.body.map((p, j) => (
                  <li key={j} className="leading-relaxed">
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="border-t px-6 py-3 flex justify-end bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary px-4 py-2 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
