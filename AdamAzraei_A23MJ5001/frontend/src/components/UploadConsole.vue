<template>
  <div class="upload-console">
    <h2>Upload Raw Input</h2>
    <form @submit.prevent="submitData">
      
      <div class="form-group">
        <label>Title:</label>
        <input type="text" v-model="formData.title" required placeholder="e.g., Damaged Parcel Report" />
      </div>

      <div class="form-group">
        <label>Source Content (Text):</label>
        <textarea v-model="formData.content" rows="4" required placeholder="Paste Telegram chat, email text, etc..."></textarea>
      </div>

      <div class="form-group">
        <label>Attach File (Optional):</label>
        <input type="file" @change="handleFileUpload" accept=".pdf,.docx,.txt" />
        <small v-if="fileName">Attached: {{ fileName }}</small>
      </div>

      <div class="form-group">
        <label>Tags (comma separated):</label>
        <input type="text" v-model="tagsInput" placeholder="Damage, Telegram, Urgent" />
      </div>

      <button type="submit">Save as Draft</button>
    </form>

    <p v-if="successMessage" class="success">{{ successMessage }}</p>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'UploadConsole',
  data() {
    return {
      formData: {
        title: '',
        content: '',
        summary: 'Awaiting AI Summary...', // Placeholder for future RPA/LLM integration
        status: 'Draft', // Defaults to Draft as per requirements
        creator: 'admin_user',
        dateCreated: new Date().toISOString().split('T')[0]
      },
      tagsInput: '',
      fileName: null,
      successMessage: ''
    };
  },
  methods: {
    handleFileUpload(event) {
      const file = event.target.files[0];
      if (file) {
        this.fileName = file.name;
        // In a real app, you'd upload the file to a server here.
        // For a mock JSON API, we will just save the file name as a reference.
      }
    },
    async submitData() {
      try {
        // Convert comma-separated string into an array of tags
        const tagsArray = this.tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);
        
        // Prepare the final object to send
        const payload = {
          ...this.formData,
          tags: tagsArray,
          attachedFile: this.fileName 
        };

        // Fire the POST request to your JSON server
        await axios.post('http://localhost:3000/articles', payload);
        
        this.successMessage = "Draft saved successfully!";
        
        // Reset the form
        this.formData.title = '';
        this.formData.content = '';
        this.tagsInput = '';
        this.fileName = null;
        
      } catch (error) {
        console.error("Error saving draft:", error);
      }
    }
  }
}
</script>

<style scoped>
.upload-console {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background-color: #fff;
  text-align: left;
}
.form-group {
  margin-bottom: 15px;
}
label {
  display: block;
  font-weight: bold;
  margin-bottom: 5px;
}
input[type="text"], textarea {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
}
button {
  background-color: #d40511;
  color: white;
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
button:hover {
  background-color: #a3040d;
}
.success {
  color: green;
  margin-top: 15px;
  font-weight: bold;
}
</style>