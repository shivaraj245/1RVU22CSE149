import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Grid, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import useLog from './useLog';

export default function StatsPage() {
  const [urls, setUrls] = useState<any[]>([]);
  const [details, setDetails] = useState<any | null>(null);
  const log = useLog();

  useEffect(() => {
    fetch('http://localhost:8000/shorturls')
      .then(r => r.json())
      .then(data => { setUrls(data); log('info', 'page', 'Stats page opened'); });
  }, [log]);

  const handleDetails = async (shortcode: string) => {
    const res = await fetch(`http://localhost:8000/shorturls/${shortcode}`);
    const data = await res.json();
    setDetails(data);
    log('info', 'component', `Viewed details for ${shortcode}`);
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" gutterBottom>Statistics</Typography>
      <Grid container spacing={2}>
        {urls.map(u => (
          <Grid item xs={12} sm={6} md={4} key={u.id}>
            <Card>
              <CardContent>
                <Typography>Short Link: <a href={u.shortLink} target="_blank" rel="noopener noreferrer">{u.shortcode}</a></Typography>
                <Typography>Created: {new Date(u.createdAt).toLocaleString()}</Typography>
                <Typography>Expiry: {new Date(u.expiry).toLocaleString()}</Typography>
                <Typography>Clicks: {u.clicks}</Typography>
                <Button onClick={() => handleDetails(u.shortcode)}>View Details</Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {details && (
        <Box mt={4}>
          <Typography variant="h6">Click Data for {details.shortcode}</Typography>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Referrer</TableCell>
                <TableCell>Location</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {details.clickData.map((c: any, i: number) => (
                <TableRow key={i}>
                  <TableCell>{new Date(c.timestamp).toLocaleString()}</TableCell>
                  <TableCell>{c.referrer}</TableCell>
                  <TableCell>{c.location}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
