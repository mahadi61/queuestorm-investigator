import express, { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { analyzeTicket } from './analyzer';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const handleRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await analyzeTicket(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

app.post('/', handleRequest);
app.post('/analyze', handleRequest);
app.post('/investigate', handleRequest);
app.post('/api/analyze', handleRequest);
app.post('/api/investigate', handleRequest);
app.post('/api/v1/analyze', handleRequest);
app.post('/api/v1/investigate', handleRequest);

app.listen(PORT, () => {
  console.log(`QueueStorm Investigator server is running on port ${PORT}`);
});

export = app;
