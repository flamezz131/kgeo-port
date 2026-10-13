import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const programsRouter = Router();

programsRouter.get('/programs', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('programs')
      .select('name');

    if (error) {
      console.error('Database error in GET /programs:', error instanceof Error ? { message: error.message, stack: error.stack } : error);
      res.status(500).json({ error: 'Failed to fetch programs' });
      return;
    }

    // Get distinct program names, exclude nulls/empties, sort alphabetically
    const distinctPrograms = Array.from(new Set(data.map((r) => r.name)))
      .filter((name) => name && name.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));

    res.status(200).json({ programs: distinctPrograms });
  } catch (err) {
    console.error('Unhandled exception in GET /programs:', err instanceof Error ? { message: err.message, stack: err.stack } : err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
