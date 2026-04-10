import React from "react";
import { methodologySections } from "../../content/helpContent";

export const MethodologyCollapsible: React.FC = () => {
  return (
    <details className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4 open:shadow-sm">
      <summary className="cursor-pointer font-medium text-slate-800 flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
        <i className="fa-solid fa-book-open text-blue-600" aria-hidden />
        <span>Calculation methodology & reference thresholds</span>
        <span className="text-xs font-normal text-slate-500 ml-1">
          (click to expand)
        </span>
      </summary>
      <div className="mt-4 space-y-6 text-sm text-slate-700 poppins leading-relaxed border-t border-slate-200 pt-4">
        {methodologySections.map((sec, i) => (
          <section key={i}>
            <h3 className="font-semibold text-slate-900 mb-2">{sec.title}</h3>
            <ul className="space-y-2 list-disc list-inside">
              {sec.body.map((p, j) => (
                <li key={j}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
};
