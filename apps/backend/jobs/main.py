#!/usr/bin/env python3

import sys
from product_matching import match_products  
from image_download import process_images
import logging
import os

def main():
    if len(sys.argv) < 2:
        print("Usage: python script.py <folder_path>")
        sys.exit(1)

    folder_path = sys.argv[1]

    # Set up logging inside the folder
    log_file = os.path.join(folder_path, 'image_download.log')
    logging.basicConfig(filename=log_file, level=logging.INFO,
                        format='%(asctime)s - %(levelname)s - %(message)s')

    logging.info(f"Started processing folder: {folder_path}")
    print(f"Processing products in folder: {folder_path}")
    
    # First: extract features from images and save updated product data
    process_images(folder_path)

    # Second: perform product matching using those features
    output_data = match_products(folder_path)

    print(f"Matching completed. Output written to {folder_path}/output.json")

if __name__ == '__main__':
    main()