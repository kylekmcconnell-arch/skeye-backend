const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for backend operations
);

// Upload file to Supabase Storage
async function uploadFile(bucket, file, filename) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) throw error;
  return data;
}

// Get public URL for a file
function getPublicUrl(bucket, filename) {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(filename);
  
  return data.publicUrl;
}

// Get signed URL for private files (videos)
async function getSignedUrl(bucket, filename, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filename, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

// Delete file from storage
async function deleteFile(bucket, filename) {
  const { error } = await supabase.storage
    .from(bucket)
    .remove([filename]);

  if (error) throw error;
  return true;
}

// List files in a bucket
async function listFiles(bucket, folder = '') {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder);

  if (error) throw error;
  return data;
}

module.exports = {
  supabase,
  uploadFile,
  getPublicUrl,
  getSignedUrl,
  deleteFile,
  listFiles
};
