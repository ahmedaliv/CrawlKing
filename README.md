# CrawlKing

CrawlKing is a web application for data scraping that provides a user-friendly interface for initiating and managing web scraping tasks.

## Features

- User Interface for inputting scraping parameters (URL and ZIP code)
- Backend scraping engine powered by Node.js and Playwright
- Data export functionality
- Dockerized backend for easy deployment
- Currently supports scraping from JioMart and DMart (requires Indian proxy/VPN)

## Tech Stack

### Backend
- Node.js
- Express.js
- Playwright for web scraping
- MongoDB with Mongoose for data storage
- JWT for authentication
- Docker for containerization

### Frontend
- React with Vite
- React Router for navigation
- React Query for state management
- TailwindCSS for styling

## Getting Started

### Backend Setup

1. Clone the repository:
git clone https://github.com/ahmedaliv/CrawlKing.git
cd CrawlKing/backend
Copy
2. Install dependencies:

pnpm install

3. Set up environment variables (create a `.env` file with necessary configurations)
add the frontend url and the database url in the .env file via the following format:
FRONTEND_URL=http://localhost:3000
DATABASE_URL=mongodb://localhost:27017/crawlking

4. Run the backend:
pnpm start

Alternatively, you can use Docker:
docker build -t crawlking_backend .
docker run -p 3000:3000 crawlking_backend

### Frontend Setup

1. Navigate to the frontend directory:
cd ../client
Copy
2. Install dependencies:
pnpm install

3. Set up the api url in client.ts file

4. Run the development server:
pnpm dev

## Usage

1. Access the web application through your browser
2. Input the target URL (currently supporting JioMart and DMart) and ZIP code for scraping
3. For DMart scraping, ensure you're using an Indian proxy or VPN
4. Initiate the scraping process
5. Once complete, use the export button to download the scraped data

## Supported Websites

- JioMart
- DMart (requires Indian proxy/VPN)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.