import requests
import os
import json
import logging
import hashlib
import random
import re
import sys

def process_images(folder_path):
    # Set up logging (file only)
    # logging.basicConfig(filename='image_download.log', level=logging.INFO, 
    #                     format='%(asctime)s - %(levelname)s - %(message)s')

    OUTPUT_DIR = os.path.join(folder_path, "downloaded_images")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    JSON_FILE = os.path.join(folder_path, "normalizedProducts.json")
    with open(JSON_FILE, 'r') as f:
        products = json.load(f)

    image_url_map = {}

    def generate_filename_from_url(url):
        match = re.search(r'\.([a-zA-Z0-9]+)(?:\?.*)?$', url)
        ext = match.group(0) if match else '.jpg'
        md5_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
        return f"{md5_hash}{ext}"

    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0"
    ]

    session = requests.Session()
    session.headers.update({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive"
    })

    def download_image(image_url, output_path, timeout=40):
        if os.path.exists(output_path):
            logging.info(f"File already exists, skipping download: {image_url} -> {output_path}")
            return True

        session.headers.update({
            "User-Agent": random.choice(USER_AGENTS)
        })

        try:
            response = session.get(image_url, timeout=timeout)
            response.raise_for_status()

            with open(output_path, 'wb') as f:
                f.write(response.content)
            logging.info(f"Successfully downloaded: {image_url} -> {output_path}")
            return True
        except requests.exceptions.RequestException as e:
            logging.error(f"Failed to download {image_url}: {str(e)}")
            return False

    total_images = len(products)
    downloaded_count = 0
    failed_count = 0

    for idx, product in enumerate(products):
        image_url = product.get("imageUrl")
        if not image_url:
            product["localImagePath"] = None
            continue

        if image_url in image_url_map:
            product["localImagePath"] = image_url_map[image_url]
            continue

        filename = generate_filename_from_url(image_url)
        output_path = os.path.join(OUTPUT_DIR, filename)

        if download_image(image_url, output_path):
            image_url_map[image_url] = output_path
            product["localImagePath"] = output_path
            downloaded_count += 1
        else:
            product["localImagePath"] = None
            failed_count += 1

        if (idx + 1) % 100 == 0:
            print(f"Processed {idx + 1}/{total_images} images: Downloaded = {downloaded_count}, Failed = {failed_count}")

    OUTPUT_JSON_PATH = os.path.join(folder_path, "normalizedProducts_with_paths.json")
    with open(OUTPUT_JSON_PATH, 'w') as f:
        json.dump(products, f, indent=4)

    print(f"Download complete. Updated JSON saved as {OUTPUT_JSON_PATH}. Check image_download.log for details.")
    return OUTPUT_JSON_PATH

# -------- Entry point --------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python script.py <folder_path>")
        sys.exit(1)

    folder_path = sys.argv[1]
    print(f"Processing folder: {folder_path}")
    process_images(folder_path)
