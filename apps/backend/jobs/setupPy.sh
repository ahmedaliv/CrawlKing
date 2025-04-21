#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Creating virtual environment in $SCRIPT_DIR/venv"
python3 -m venv "$SCRIPT_DIR/venv"

echo "Activating virtual environment and installing packages"
source "$SCRIPT_DIR/venv/bin/activate" && \
pip install --upgrade pip && \
pip install torch torchvision transformers scikit-learn numpy pillow pathlib hf_xet

echo "Python environment setup complete in $SCRIPT_DIR/venv"