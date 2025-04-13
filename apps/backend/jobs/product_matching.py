import json
import pickle
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from collections import defaultdict
import torch
from torchvision import models, transforms
from torchvision.models import ResNet50_Weights
from PIL import Image
from pathlib import Path
from transformers import BertTokenizer, BertModel
import os
import logging

def match_products(folder_path: str):

    # Setup paths
    log_dir = os.path.join(folder_path, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file_path = os.path.join(log_dir, "product_matching.log")
    json_path = os.path.join(folder_path, "normalizedProducts_with_paths.json")
    cached_features_path = os.path.join(folder_path, "cached_image_features.pkl")
    failed_files_path = os.path.join(folder_path, "failed_image_files.pkl")
    output_path = os.path.join(folder_path, "output.json")

    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(log_file_path)
        ]
    )

    logging.info("Starting the product matching process.")

    # Load products
    logging.info(f"Loading JSON from {json_path}")
    with open(json_path, 'r') as f:
        products = json.load(f)
    logging.info(f"Loaded {len(products)} products from JSON.")

    # Use device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logging.info(f"Using device: {device}")

    # Setup ResNet
    model = models.resnet50(weights=ResNet50_Weights.IMAGENET1K_V1)
    model.eval()
    model = torch.nn.Sequential(*list(model.children())[:-1])
    model = model.to(device)

    preprocess = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    # Setup BERT
    tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
    bert_model = BertModel.from_pretrained('bert-base-uncased')
    bert_model.eval()
    bert_model = bert_model.to(device)

    # Load caches
    if os.path.exists(cached_features_path):
        logging.info("Loading cached image features.")
        with open(cached_features_path, 'rb') as f:
            cached_features = pickle.load(f)
    else:
        cached_features = {}

    if os.path.exists(failed_files_path):
        logging.info("Loading failed image files.")
        with open(failed_files_path, 'rb') as f:
            failed_files = pickle.load(f)
    else:
        failed_files = set()

    def extract_features(image_path, processed_files=None):
        if processed_files is None:
            processed_files = set()
        if image_path in processed_files:
            return None
        if image_path in cached_features:
            return cached_features[image_path]

        try:
            if not Path(image_path).is_file():
                processed_files.add(image_path)
                return None
            img = Image.open(image_path)
            if img.mode == 'P' and 'transparency' in img.info:
                img = img.convert('RGBA')
            img = img.convert('RGB')
            img_t = preprocess(img).unsqueeze(0).to(device)
            with torch.no_grad():
                features = model(img_t)
            features = features.squeeze().cpu().numpy()
            cached_features[image_path] = features
            return features
        except Exception as e:
            logging.error(f"Error processing {image_path}: {str(e)}")
            processed_files.add(image_path)
            return None

    logging.info("Starting feature extraction for product images.")
    processed_count = 0
    for product in products:
        if product.get('localImagePath'):
            features = extract_features(product['localImagePath'], failed_files)
            product['imageFeatures'] = features if features is not None else None
            processed_count += 1
            if processed_count % 100 == 0:
                logging.info(f"Processed {processed_count} images.")
                with open(cached_features_path, 'wb') as f:
                    pickle.dump(cached_features, f)
                with open(failed_files_path, 'wb') as f:
                    pickle.dump(failed_files, f)
    logging.info("Feature extraction completed.")

    with open(cached_features_path, 'wb') as f:
        pickle.dump(cached_features, f)
    with open(failed_files_path, 'wb') as f:
        pickle.dump(failed_files, f)

    # Grouping
    groups = defaultdict(list)
    for product in products:
        if product.get('imageFeatures') is not None or product.get('cleanedTitle'):
            key = (product['brand'], product['mrp'])
            groups[key].append(product)

    def compute_title_embeddings(titles, batch_size=32):
        embeddings = []
        for i in range(0, len(titles), batch_size):
            batch_titles = [t if t is not None else "" for t in titles[i:i + batch_size]]
            inputs = tokenizer(
                batch_titles,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=128
            )
            inputs = {k: v.to(device) for k, v in inputs.items()}
            with torch.no_grad():
                outputs = bert_model(**inputs)
            batch_embeddings = outputs.last_hidden_state[:, 0, :].cpu().numpy()
            embeddings.append(batch_embeddings)
        return np.vstack(embeddings)

    def compute_title_similarity(group):
        titles = [p['cleanedTitle'] for p in group]
        embeddings = compute_title_embeddings(titles)
        return cosine_similarity(embeddings)

    def form_subgroups(group, threshold=0.8, use_image_similarity=True, use_title_similarity=True, image_weight=0.5):
        if not group:
            return []
        features = [p['imageFeatures'] for p in group]
        image_sim_matrix = np.zeros((len(group), len(group)))
        if use_image_similarity:
            valid_indices = [i for i, f in enumerate(features) if f is not None]
            if valid_indices:
                valid_features = [features[i] for i in valid_indices]
                valid_sim_matrix = cosine_similarity(valid_features)
                for i_idx, i in enumerate(valid_indices):
                    for j_idx, j in enumerate(valid_indices):
                        image_sim_matrix[i][j] = valid_sim_matrix[i_idx][j_idx]
        title_sim_matrix = compute_title_similarity(group) if use_title_similarity else np.zeros((len(group), len(group)))
        sim_matrix = (
            image_weight * image_sim_matrix + (1 - image_weight) * title_sim_matrix
            if use_image_similarity and use_title_similarity else
            image_sim_matrix if use_image_similarity else title_sim_matrix
        )
        remaining = set(range(len(group)))
        subgroups = []
        while remaining:
            best_p = None
            best_s_p_size = -1
            best_connections = {}
            for p_idx in remaining:
                p_source = group[p_idx]['source']
                connections = defaultdict(list)
                for q_idx in remaining:
                    if group[q_idx]['source'] != p_source and sim_matrix[p_idx][q_idx] > threshold:
                        connections[group[q_idx]['source']].append((q_idx, sim_matrix[p_idx][q_idx]))
                if len(connections) > best_s_p_size:
                    best_s_p_size = len(connections)
                    best_p = p_idx
                    best_connections = connections
            if best_p is None or best_s_p_size == 0:
                for p_idx in list(remaining):
                    subgroups.append([group[p_idx]])
                    remaining.remove(p_idx)
                break
            subgroup = [(best_p, group[best_p])]
            indices_to_remove = {best_p}
            for source, candidates in best_connections.items():
                selected_q_idx, _ = max(candidates, key=lambda x: x[1])
                subgroup.append((selected_q_idx, group[selected_q_idx]))
                indices_to_remove.add(selected_q_idx)
            remaining -= indices_to_remove
            subgroups.append([prod for idx, prod in subgroup])
        return subgroups

    clustering_mode = 'both'
    use_image_similarity = clustering_mode in ['image', 'both']
    use_title_similarity = clustering_mode in ['title', 'both']
    image_weight = 0.5

    clustered_groups = {}
    for key, group in groups.items():
        subgroups = form_subgroups(group, 0.8, use_image_similarity, use_title_similarity, image_weight)
        clustered_groups[key] = subgroups
        logging.info(f"Formed {len(subgroups)} subgroups for group {key}.")

    output = []
    for (brand, mrp), subgroups in clustered_groups.items():
        for subgroup in subgroups:
            if subgroup:
                rep_product = subgroup[0]
                entry = {
                    "name": rep_product['title'],
                    "MRP": mrp,
                    "brand": brand,
                    "cleanedTitle": rep_product['cleanedTitle'],
                    "matches": [
                        {
                            "title": p['title'],
                            "brand": p['brand'],
                            "price": p['price'],
                            "imageUrl": p['imageUrl'],
                            "url": p['url'],
                            "source": p['source'],
                            "quantity": p['quantity'],
                            "cleanedTitle": p['cleanedTitle']
                        } for p in subgroup
                    ],
                    "pincode": rep_product['pincode']
                }
                output.append(entry)

    output.sort(key=lambda x: len(x["matches"]), reverse=True)
    groups_more_than_one = sum(1 for group in output if len(group["matches"]) > 1)
    groups_only_one = sum(1 for group in output if len(group["matches"]) == 1)

    logging.info(f"Total groups in output: {len(output)}")
    logging.info(f"Groups with >1 match: {groups_more_than_one}")
    logging.info(f"Groups with only one match: {groups_only_one}")
    logging.info(f"Total products processed: {len(products)}")

    with open(output_path, 'w') as f:
        json.dump(output, f, indent=4)
    logging.info(f"Output saved to {output_path}")
    logging.info("Product matching process completed successfully.")
