#!/bin/bash

python3 -m venv venv
source ./venv/bin/activate
pip install torch torchvision transformers scikit-learn numpy pillow pathlib