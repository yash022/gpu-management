-- Seed data for GPU Resource Reservation System
-- Run after schema.sql

-- Insert admin user (password: admin123 - bcrypt hashed)
INSERT INTO users (name, email, password, role) VALUES
('Admin User', 'admin@muj.manipal.edu', '$2a$10$D25OpvUu4Z89emwpUsZZS./a01j0D8HdphFBXXxfc1okQiDAJvgsi', 'admin');

-- Insert sample GPUs
INSERT INTO gpus (model, vram, status, location) VALUES
('NVIDIA A100', '80 GB', 'available', 'Server Room A - Rack 1'),
('NVIDIA A100', '80 GB', 'available', 'Server Room A - Rack 2'),
('NVIDIA V100', '32 GB', 'available', 'Server Room A - Rack 3'),
('NVIDIA V100', '32 GB', 'maintenance', 'Server Room B - Rack 1'),
('NVIDIA RTX 4090', '24 GB', 'available', 'Server Room B - Rack 2'),
('NVIDIA RTX 4090', '24 GB', 'available', 'Server Room B - Rack 3'),
('NVIDIA RTX 3090', '24 GB', 'available', 'Lab 204 - Workstation 1'),
('NVIDIA Tesla T4', '16 GB', 'available', 'Server Room C - Rack 1');
