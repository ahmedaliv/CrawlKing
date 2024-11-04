// Global Error Handling Middleware
const errorMiddleware = ((err, req, res, next) => {
  console.error(err.stack); // Log the error stack trace for debugging
  res.status(500).json({ error: 'Something went wrong!' }); // Send a consistent error response
});

export default errorMiddleware;

