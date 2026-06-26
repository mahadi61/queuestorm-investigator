import express from 'express';
import * as dotenv from 'dotenv';
import { analyzeTicket } from './analyzer.js';
dotenv.config();
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;
const handleRequest = async (req, res) => {
    try {
        const { ticket_id, complaint, transaction_history } = req.body;
        // Input validation — 400 for missing required fields
        if (!ticket_id || typeof ticket_id !== 'string' || ticket_id.trim() === '') {
            res.status(400).json({ error: 'Bad Request', message: 'Missing required field: ticket_id' });
            return;
        }
        if (!complaint || typeof complaint !== 'string' || complaint.trim() === '') {
            res.status(400).json({ error: 'Bad Request', message: 'Missing required field: complaint' });
            return;
        }
        if (transaction_history !== undefined && !Array.isArray(transaction_history)) {
            res.status(422).json({ error: 'Unprocessable Entity', message: 'transaction_history must be an array' });
            return;
        }
        const result = await analyzeTicket(req.body);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
};
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.post('/analyze-ticket', handleRequest);
// Only start listening when this file is the entry point (not when imported by tests)
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`QueueStorm Investigator server is running on port ${PORT}`);
    });
}
export default app;
