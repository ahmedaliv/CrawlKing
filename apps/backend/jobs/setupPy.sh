#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Create virtualenv only if it doesn't exist
if [ ! -d "venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv venv
fi

# Activate the virtual environment
source ./venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install required packages (using a requirements.txt is more stable)
pip install torch torchvision transformers scikit-learn numpy pillow pathlib hf_xet

echo "Python environment is ready ✅"
