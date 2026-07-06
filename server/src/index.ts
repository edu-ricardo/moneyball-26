import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api';
// Initialize db connection
import './db/database';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api', apiRoutes);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
