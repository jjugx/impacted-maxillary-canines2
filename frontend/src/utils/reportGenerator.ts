import jsPDF from 'jspdf';
import 'jspdf-autotable';
import autoTable from 'jspdf-autotable';

// Helper: load an image URL as a Data URL for embedding into PDF
const loadImageAsDataURL = async (url?: string): Promise<string | undefined> => {
  try {
    if (!url) return undefined;
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (_) {
    return undefined;
  }
};

// Helper: draw an image with aspect ratio inside a max box and add a caption
const drawImageWithCaption = (
  doc: jsPDF,
  dataUrl: string,
  caption: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
) => {
  // Try to infer image ratio by creating temporary Image in browser context
  // Fallback: assume panoramic ratio ~2.0
  let drawW = maxW;
  let drawH = maxH;
  try {
    // jsPDF doesn't give us native image size; estimate by ratio from data URL if possible
    // We safely create a temporary Image only when running in browser
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const img = new Image();
    img.src = dataUrl;
    const w = (img as HTMLImageElement).naturalWidth || (img as HTMLImageElement).width;
    const h = (img as HTMLImageElement).naturalHeight || (img as HTMLImageElement).height;
    if (w && h) {
      const ratio = w / h;
      drawW = maxW;
      drawH = drawW / ratio;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * ratio;
      }
    } else {
      // fallback keep within bounds with assumed ratio
      const ratio = 2.0;
      drawW = maxW;
      drawH = Math.min(maxH, drawW / ratio);
    }
  } catch {
    const ratio = 2.0;
    drawW = maxW;
    drawH = Math.min(maxH, drawW / ratio);
  }

  doc.addImage(dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
  // Caption under the image
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(caption, x, y + drawH + 5);
  return y + drawH + 12; // return next Y position
};

export const generatePDF = async (
  result: any,
  images?: {
    originalImage?: string;
    resultImage?: string;
    segmentationImage?: string;
    dentalOverlayImage?: string;
  }
) => {
  // Create a new PDF document
  const doc = new jsPDF();

  // Add title and header
  doc.setFontSize(20);
  doc.setTextColor(66, 139, 202);
  doc.text('Maxillary Impacted Canine Analysis Report', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);

  // Add patient info
  doc.text(`Analysis Date: ${new Date(result.created_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}`, 20, 40);
  doc.text(`Case ID: ${result.id}`, 20, 50);

  // Add prediction result
  doc.setFontSize(16);
  doc.text('Prediction Result:', 20, 70);

  const formattedResult = result.prediction_result
    ? result.prediction_result
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : 'Unknown';

  // Set text color based on prediction
  if (result.prediction_result?.includes('normal')) {
    doc.setTextColor(0, 128, 0); // Green
  } else if (result.prediction_result?.includes('severely')) {
    doc.setTextColor(255, 0, 0); // Red
  } else {
    doc.setTextColor(255, 140, 0); // Orange
  }

  doc.setFontSize(14);
  doc.text(formattedResult, 120, 70);
  doc.setTextColor(0, 0, 0);

  // Add analysis details
  if (result.analysis) {
    // Sector Analysis
    if (result.analysis.sector_analysis) {
      doc.setFontSize(14);
      doc.text('Sector Analysis', 20, 90);

      autoTable(doc, {
        startY: 95,
        head: [['Parameter', 'Value']],
        body: [
          ['Sector', String(result.analysis.sector_analysis.sector || '')],
          ['Impaction Type', result.analysis.sector_analysis.impaction_type || '']
        ],
        theme: 'grid',
        headStyles: { fillColor: [66, 139, 202] }
      });
    }

    // Canine Assessment
    if (result.analysis.canine_assessment) {
      const lastTableEnd = (doc as any).lastAutoTable?.finalY || 95;

      doc.setFontSize(14);
      doc.text('Canine Assessment', 20, lastTableEnd + 15);

      const canineAssessment = result.analysis.canine_assessment;

      autoTable(doc, {
        startY: lastTableEnd + 20,
        head: [['Parameter', 'Value', 'Unfavorable']],
        body: [
          ['Overlap with Lateral', canineAssessment.overlap || '',
            canineAssessment.overlap === 'Yes' ? 'Unfavorable' : canineAssessment.overlap === 'No' ? 'Favorable' : ''],
          ['Vertical Height', canineAssessment.vertical_height || '',
            canineAssessment.vertical_height?.includes('Beyond') ? 'Unfavorable' : 'Favorable'],
          ['Root Position', canineAssessment.root_position || '',
            canineAssessment.root_position?.includes('Above') ? 'Favorable' : 'Unfavorable'],
        ],
        theme: 'grid',
        headStyles: { fillColor: [66, 139, 202] }
      });
    }

    // Angle Measurements
    if (result.analysis.angle_measurements && Object.keys(result.analysis.angle_measurements).length > 0) {
      const lastTableEnd = (doc as any).lastAutoTable?.finalY || 95;

      doc.setFontSize(14);
      doc.text('Angle Measurements', 20, lastTableEnd + 15);

      const angleMeasurements = result.analysis.angle_measurements;
      const angleData = [];

      if (angleMeasurements.angle_with_midline) {
        angleData.push([
          'Angle with Midline',
          `${angleMeasurements.angle_with_midline.value.toFixed(2)}°`,
          angleMeasurements.angle_with_midline.difficulty
        ]);
      }

      if (angleMeasurements.angle_with_lateral) {
        angleData.push([
          'Angle with Lateral Incisor',
          `${angleMeasurements.angle_with_lateral.value.toFixed(2)}°`,
          angleMeasurements.angle_with_lateral.difficulty
        ]);
      }

      if (angleMeasurements.angle_with_occlusal) {
        angleData.push([
          'Angle with Occlusal Plane',
          `${angleMeasurements.angle_with_occlusal.value.toFixed(2)}°`,
          angleMeasurements.angle_with_occlusal.difficulty
        ]);
      }

      autoTable(doc, {
        startY: lastTableEnd + 20,
        head: [['Measurement', 'Value', 'Unfavorable']],
        body: angleData,
        theme: 'grid',
        headStyles: { fillColor: [66, 139, 202] }
      });
    }

    // ROI Classification
    if (result.analysis.roi) {
      const lastTableEnd = (doc as any).lastAutoTable?.finalY || 95;

      doc.setFontSize(14);
      doc.text('ROI Classification', 20, lastTableEnd + 15);

      const roi = result.analysis.roi;
      const impactedSidesText = Array.isArray(roi.impacted_sides) && roi.impacted_sides.length > 0
        ? roi.impacted_sides.join(', ')
        : 'None';
      const overallRoiText = roi.prediction_result
        ? roi.prediction_result.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : (roi.overall_impacted === true
            ? 'Impacted'
            : (roi.overall_impacted === false ? 'Normal' : 'Unknown'));

      autoTable(doc, {
        startY: lastTableEnd + 20,
        head: [['Parameter', 'Value']],
        body: [
          ['ROI Source', roi.used_source || '—'],
          ['Threshold', (typeof roi.threshold === 'number') ? roi.threshold.toFixed(2) : '—'],
          ['Impacted Sides', impactedSidesText],
          ['Overall (ROI)', overallRoiText]
        ],
        theme: 'grid',
        headStyles: { fillColor: [66, 139, 202] }
      });

      // Per-side details
      const lastTableEndRoi = (doc as any).lastAutoTable?.finalY || (lastTableEnd + 20);
      const sides = roi.sides || {};
      const sideRows: any[] = [];
      const left = sides.left;
      const right = sides.right;

      if (left) {
        const prob = (typeof left.prob === 'number') ? `${(left.prob * 100).toFixed(1)}%` : '—';
        const outcome = (left.impacted === true) ? 'Impacted' : (left.impacted === false ? 'Normal' : 'Unknown');
        sideRows.push(['Left', prob, outcome]);
      }

      if (right) {
        const prob = (typeof right.prob === 'number') ? `${(right.prob * 100).toFixed(1)}%` : '—';
        const outcome = (right.impacted === true) ? 'Impacted' : (right.impacted === false ? 'Normal' : 'Unknown');
        sideRows.push(['Right', prob, outcome]);
      }

      if (sideRows.length > 0) {
        autoTable(doc, {
          startY: lastTableEndRoi + 10,
          head: [['Side', 'Probability', 'Outcome']],
          body: sideRows,
          theme: 'grid',
          headStyles: { fillColor: [66, 139, 202] }
        });
      }
    }

    // Final Assessment
    const lastTableEnd = (doc as any).lastAutoTable?.finalY || 95;

    doc.setFontSize(14);
    doc.text('Final Assessment', 20, lastTableEnd + 15);

    autoTable(doc, {
      startY: lastTableEnd + 20,
      head: [['Parameter', 'Value']],
      body: [
        ['Difficult Factors', `${result.analysis.difficult_factors || 0} / 6`],
        ['Final Prediction', formattedResult]
      ],
      theme: 'grid',
      headStyles: { fillColor: [66, 139, 202] }
    });

    // Clinical Recommendations
    const lastTableEnd2 = (doc as any).lastAutoTable?.finalY || 95;

    doc.setFontSize(14);
    doc.text('Clinical Recommendations', 20, lastTableEnd2 + 15);

    let recommendations = '';

    if (result.prediction_result?.includes('impacted')) {
      recommendations = 'The analysis indicates canine impaction. Clinical recommendations include:\n' +
        '• Comprehensive clinical evaluation by an orthodontist\n' +
        '• Consider additional imaging such as CBCT for 3D assessment\n' +
        '• Potential early intervention to guide canine eruption\n' +
        '• Possible extraction of deciduous canine if present';

      if (result.prediction_result?.includes('severely')) {
        recommendations += '\n• Higher difficulty level anticipated for treatment\n' +
          '• May require surgical exposure and orthodontic traction';
      }
    } else {
      recommendations = 'The analysis indicates normal canine positioning. Recommendations include:\n' +
        '• Continue routine dental monitoring\n' +
        '• Regular orthodontic check-ups as scheduled\n' +
        '• No immediate intervention needed for the canine\n' +
        '• Maintain good oral hygiene';
    }

    doc.setFontSize(10);
    doc.text(recommendations, 20, lastTableEnd2 + 30, {
      maxWidth: 170,
      lineHeightFactor: 1.5
    });

    // Add disclaimer
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const disclaimer = 'Note: This is an AI-assisted analysis and should be confirmed by a qualified dental professional.';
    doc.text(disclaimer, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }

  // Add page numbers
  const totalPages = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${totalPages}`, doc.internal.pageSize.getWidth() - 20, doc.internal.pageSize.getHeight() - 10);
  }

  // Add images section (new page)
  try {
    const pageMargin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxW = pageWidth - pageMargin * 2; // full width minus margins
    const maxH = 60; // per image box height

    const originalData = await loadImageAsDataURL(images?.originalImage);
    const kpData = await loadImageAsDataURL(images?.resultImage);
    const segData = await loadImageAsDataURL(images?.segmentationImage);
    const overlayData = await loadImageAsDataURL(images?.dentalOverlayImage);

    if (originalData || kpData || segData || overlayData) {
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('Images', pageWidth / 2, 20, { align: 'center' });

      let y = 28;
      if (originalData) {
        y = drawImageWithCaption(doc, originalData, 'Original X-ray', pageMargin, y, maxW, maxH);
      }
      if (kpData) {
        if (y + maxH + 20 > pageHeight) { doc.addPage(); y = 20; }
        y = drawImageWithCaption(doc, kpData, 'Keypoint Detection Overlay', pageMargin, y, maxW, maxH);
      }
      if (segData) {
        if (y + maxH + 20 > pageHeight) { doc.addPage(); y = 20; }
        y = drawImageWithCaption(doc, segData, 'Tooth Segmentation Overlay', pageMargin, y, maxW, maxH);
      }
      if (overlayData) {
        if (y + maxH + 20 > pageHeight) { doc.addPage(); y = 20; }
        y = drawImageWithCaption(doc, overlayData, 'ROI-guided Dental Overlay', pageMargin, y, maxW, maxH);
      }
    }
  } catch (_) {
    // If image loading fails, skip images section silently
  }

  // Save the PDF with a filename including the case ID and date
  const dateStr = new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }).replace(/\//g, '-');
  doc.save(`canine-analysis-${result.id}-${dateStr}.pdf`);
};
