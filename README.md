# CrawlKing

**CrawlKing** is a web application designed for efficient data scraping, offering a user-friendly interface for initiating and managing web scraping tasks.

## Features

- **User-Friendly Interface**: Easily input scraping parameters like URL and ZIP code.
- **Powerful Backend Engine**: Built with Node.js and Playwright for robust scraping.
- **Data Export**: Conveniently export scraped data in various formats.
- **Dockerized Backend**: Simplified deployment using Docker containers.
- **Targeted Scraping**: Supports scraping from JioMart and DMart (requires an Indian proxy/VPN).

## Tech Stack

### Backend
- **Node.js** with **Express.js** for server-side logic.
- **Playwright** for web scraping.
- **MongoDB** (with Mongoose) for data storage.
- **JWT** for secure authentication.
- **Docker** for containerization and streamlined deployment.

### Frontend
- **React** with **Vite** for a modern, fast user interface.
- **React Router** for seamless navigation.
- **React Query** for state management and server interactions.
- **TailwindCSS** for sleek, responsive styling.

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
    ```

3. **Set Up Environment Variables:**

    - Create a `.env` file with the following configurations:

    ```plaintext
    FRONTEND_URL=http://localhost:3000
    DATABASE_URL=mongodb://localhost:27017/crawlking
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
