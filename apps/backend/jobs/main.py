#!/usr/bin/env python3

import sys
from product_matcher import match_products  
from image_download import process_images

def main():
    if len(sys.argv) < 2:
        print("Usage: python script.py <folder_path>")
        sys.exit(1)

    folder_path = sys.argv[1]

    print(f"Processing products in folder: {folder_path}")
    
    # First: extract features from images and save updated product data
    process_images(folder_path)

    # Second: perform product matching using those features
    output_data = match_products(folder_path)

    print(f"Matching completed. Output written to {folder_path}/output.json")

if __name__ == '__main__':
    main()