# CrawlKing

## Getting Started

### Backend Setup

1. **Clone the Repository:**

    ```bash
    git clone https://github.com/ahmedaliv/CrawlKing.git
    cd CrawlKing/backend
    
    ```

2. **Install Dependencies:**

    ```bash
    pnpm install
    pnpm exec playwright install
    ```

3. **Set Up Environment Variables:**

    - Copy the `.env.example` file to create your `.env` file:

    ```bash
    cp .env.example .env
    ```

    - Edit the `.env` file and fill in the necessary values:

    ```plaintext
    FRONTEND_URL=http://localhost:3000
    DATABASE_URL=mongodb://localhost:27017/crawlking
    JWT_SECRET=your_jwt_secret_here
    ```

4. **Run the Backend:**

    - Start the server:

    ```bash
    pnpm start
    ```

    - Alternatively, use Docker:

    ```bash
    docker build -t crawlking_backend .
    docker run -p 3000:3000 crawlking_backend
    ```

### Frontend Setup

1. **Navigate to the Frontend Directory:**

    ```bash
    cd ../client
    ```

2. **Install Dependencies:**

    ```bash
    pnpm install
    ```

3. **Configure API URL:**

    - Update the `client.ts` file with the backend API URL.

4. **Run the Development Server:**

    ```bash
    pnpm dev
    ```

## Usage

1. **Access the Web Application**: Open the application in your browser.
2. **Input Scraping Parameters**: Enter the target URL (JioMart or DMart) and ZIP code.
3. **DMart Scraping**: Ensure you're using an Indian proxy or VPN.
4. **Initiate Scraping**: Start the scraping process through the interface.
5. **Export Data**: Once scraping is complete, download the data using the export button.

## Supported Websites

- **JioMart**
- **DMart** (Requires an Indian proxy/VPN)

## Contributing

Contributions are welcome! Please submit a Pull Request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
