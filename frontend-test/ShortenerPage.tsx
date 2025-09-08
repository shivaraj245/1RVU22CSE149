import React, { useState } from 'react';
import { Box, Button, Card, CardContent, Grid, TextField, Typography, IconButton, Snackbar } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import useLog from './useLog';

const defaultRow = { url: '', validity: '', shortcode: '', error: '', result: null as any };

export default function ShortenerPage() {
  const [rows, setRows] = useState([ { ...defaultRow } ]);
  const [snackbar, setSnackbar] = useState('');
  const log = useLog();

  const handleChange = (idx: number, field: string, value: string) => {
    const newRows = [...rows];
    newRows[idx][field] = value;
    newRows[idx].error = '';
    setRows(newRows);
  };

  const validate = (row: typeof defaultRow) => {
    try { new URL(row.url); } catch { return 'Invalid URL'; }
    if (row.validity && (!Number.isInteger(+row.validity) || +row.validity <= 0)) return 'Invalid validity';
    if (row.shortcode && !/^[A-Za-z0-9]{4,20}$/.test(row.shortcode)) return 'Invalid shortcode';
    return '';
  };

  const handleShorten = async () => {
    const newRows = rows.map(r => ({ ...r, error: validate(r) }));
    setRows(newRows);
    if (newRows.some(r => r.error)) return;
    log('info', 'page', 'Shorten requested');
    const results = await Promise.all(newRows.map(async (row) => {
      try {
        const res = await fetch('http://localhost:8000/shorturls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: row.url,
            validity: row.validity ? +row.validity : undefined,
            shortcode: row.shortcode || undefined
          })
        });
        if (!res.ok) {
          const err = await res.json();
          return { ...row, error: err.error || 'Error', result: null };
        }
        const data = await res.json();
        log('info', 'component', `Shortened: ${data.shortLink}`);
        return { ...row, error: '', result: data };
      } catch {
        return { ...row, error: 'Network error', result: null };
      }
    }));
    setRows(results);
  };

  const handleCopy = (link: string) => {
    navigator.clipboard.writeText(link);
    setSnackbar('Copied!');
    log('info', 'component', `Copied: ${link}`);
  };

  const addRow = () => {
    if (rows.length < 5) setRows([...rows, { ...defaultRow }]);
  };
  const removeRow = (idx: number) => {
    if (rows.length > 1) setRows(rows.filter((_, i) => i !== idx));
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" gutterBottom>URL Shortener</Typography>
      {rows.map((row, idx) => (
        <Card key={idx} sx={{ mb: 2 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={5}>
                <TextField label="Original URL" value={row.url} onChange={e => handleChange(idx, 'url', e.target.value)} fullWidth error={!!row.error} />
              </Grid>
              <Grid item xs={4} sm={2}>
                <TextField label="Validity (min)" value={row.validity} onChange={e => handleChange(idx, 'validity', e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={4} sm={3}>
                <TextField label="Shortcode" value={row.shortcode} onChange={e => handleChange(idx, 'shortcode', e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={4} sm={2}>
                {rows.length > 1 && <Button onClick={() => removeRow(idx)} color="error">Remove</Button>}
              </Grid>
            </Grid>
            {row.error && <Typography color="error">{row.error}</Typography>}
            {row.result && (
              <Box mt={2}>
                <Typography>Short Link: <a href={row.result.shortLink} target="_blank" rel="noopener noreferrer">{row.result.shortLink}</a></Typography>
                <Typography>Expiry: {new Date(row.result.expiry).toLocaleString()}</Typography>
                <IconButton onClick={() => handleCopy(row.result.shortLink)}><ContentCopyIcon /></IconButton>
              </Box>
            )}
          </CardContent>
        </Card>
      ))}
      <Box display="flex" gap={2}>
        <Button variant="contained" onClick={handleShorten}>Shorten</Button>
        <Button onClick={addRow} disabled={rows.length >= 5}>Add Row</Button>
      </Box>
      <Snackbar open={!!snackbar} autoHideDuration={2000} onClose={() => setSnackbar('')} message={snackbar} />
    </Box>
  );
}
