/**
 * Backend process entry point. Load environment configuration, import the configured Express
 * app, then listen on PORT (3000 by default). Importing a service alone does not start a
 * server.
 */
import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});