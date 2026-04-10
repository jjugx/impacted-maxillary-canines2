# Artificial Intelligence Powered System for Automatic Detection and Prediction of Maxillary Impacted Canine in Panoramic Radiographs

## Overview

This project is a research-based initiative aimed at developing an AI-powered system to automatically detect, classify, and predict the eruption favorability of maxillary impacted canines using panoramic radiographs. The system leverages several pre-trained deep learning models (such as ResNet-50, Inception V3, and YOLO) for image segmentation, keypoint detection, and prediction tasks. The ultimate goal is to assist clinicians in early diagnosis and treatment planning in orthodontics.

## Motivation

Maxillary canine impaction is one of the most common dental anomalies after third molar impaction, particularly in females. Impaction can lead to misalignment of adjacent teeth, functional occlusion issues, and aesthetic concerns. Early detection and accurate prediction of eruption can minimize these complications. By applying AI, this project aims to:
- Increase diagnostic accuracy,
- Reduce diagnostic time, and
- Enhance clinical decision-making.

## Features

- **Automatic Image Segmentation:**  
  Use deep learning models to accurately segment dental structures from panoramic radiographs.
  
- **Keypoint Detection:**  
  Identify 24 anatomical landmarks (e.g., cusp tips, root apices) necessary for generating measurement lines (midline, occlusal plane, tooth axis).
  
- **Classification and Prediction:**  
  Utilize a hybrid AI model that integrates outputs from segmentation and keypoint detection to classify impacted canines and predict eruption favorability based on angular and linear measurements.
  
- **Data Augmentation:**  
  Apply techniques (such as horizontal flipping) to enrich the training dataset and prevent overfitting.

## Technology Stack

- **Backend Framework:**  
  [Flask](https://flask.palletsprojects.com/) is used to build a lightweight REST API that serves the deep learning models for inference.

- **Frontend Framework:**  
  [React](https://reactjs.org/) is used to develop a modern, responsive user interface that interacts with the Flask backend via API calls.

## Methodology

1. **Data Collection:**  
   - Panoramic radiographs are collected from the Faculty of Dentistry at Khon Kaen University between January 2014 and September 2024.
   - A total of 100 high-quality images are used, split into training (60%), validation (20%), and testing (20%) sets.

2. **Image Annotation:**  
   - **Segmentation:** Define boundaries of 5 key teeth (maxillary impacted canine, central incisor, lateral incisor, first premolar, and second premolar) using Label Studio.
   - **Keypoint Detection:** Annotate 24 keypoints, including landmarks such as the anterior nasal spine, contact points between central incisors, root apices, and cusp tips.

3. **Model Development:**  
   - **Model 1:** Automatic segmentation of dental structures.
   - **Model 2:** Automatic detection of keypoints for generating essential measurement lines.
   - **Model 3:** A hybrid CNN model that fuses the outputs of Models 1 and 2 to predict the eruption favorability of impacted canines.

4. **Statistical Analysis:**  
   - Intra- and inter-rater reliability are measured using Kappa statistics.
   - Model performance is evaluated using metrics such as precision, recall, mean average precision (mAP), Intersection over Union (IoU), accuracy, and F1 Score.

## Installation and Usage

### Prerequisites

- Python 3.x
- Flask
- Deep learning libraries (e.g., PyTorch or TensorFlow/Keras)
- Computer vision libraries (e.g., OpenCV)
- Node.js and npm (for React frontend)
- Other dependencies as listed in `requirements.txt`

### Setup

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/jjugx/impacted-maxillary-canines2.git
   cd impacted-maxillary-canines2
