const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
function gpuBody(req, res, next) {
  const { model, vram, location, status = 'available' } = req.body;
  if (!text(model, 100) || !text(vram, 20) || !text(location, 100) || !['available', 'maintenance', 'retired'].includes(status)) {
    return res.status(400).json({ message: 'Provide a model, VRAM, location, and valid hardware status.' });
  }
  next();
}
function bookingBody(req, res, next) {
  const { gpu_id, date, start_time, end_time, purpose } = req.body;
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const dateValid = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!id(gpu_id) || !dateValid || !time.test(start_time) || !time.test(end_time) || start_time >= end_time || !text(purpose, 2000)) {
    return res.status(400).json({ message: 'Provide a valid GPU, date, purpose, and an end time after the start time.' });
  }
  if (new Date(`${date}T${start_time}:00+05:30`).getTime() <= Date.now()) {
    return res.status(400).json({ message: 'Reservation must start in the future (India Standard Time).' });
  }
  next();
}
function resourceId(req, res, next, value) {
  if (!/^\d+$/.test(value) || !id(value)) return res.status(400).json({ message: 'Invalid resource ID' });
  next();
}
module.exports = { text, id, gpuBody, bookingBody, resourceId };
