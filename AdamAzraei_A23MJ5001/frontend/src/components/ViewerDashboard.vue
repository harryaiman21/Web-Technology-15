<template>
  <div class="dashboard">
    <h2>DHL Knowledge Base Articles</h2>
    
    <div v-if="articles.length === 0" class="loading">No articles found. Loading...</div>

    <div v-for="article in articles" :key="article.id" class="article-card">
      <div class="card-header">
        <h3>{{ article.title }}</h3>
        <button class="delete-btn" @click="deleteArticle(article.id)">Delete</button>
      </div>
      
      <p><strong>Tags:</strong> {{ article.tags ? article.tags.join(', ') : 'None' }}</p>
      <p><strong>Summary:</strong> {{ article.summary }}</p>

      <div class="status-control">
        <label><strong>Status:</strong></label>
        <select v-model="article.status" @change="updateStatus(article.id, article.status)">
          <option value="Draft">Draft</option>
          <option value="Reviewed">Reviewed</option>
          <option value="Published">Published</option>
        </select>
        <span class="save-indicator" v-if="savedId === article.id">Status Updated!</span>
      </div>
      
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'ViewerDashboard',
  data() {
    return {
      articles: [],
      savedId: null // Used to show a quick "Saved!" message
    };
  },
  mounted() {
    this.fetchArticles();
  },
  methods: {
    // 1. GET Request
    async fetchArticles() {
      try {
        const response = await axios.get('http://localhost:3000/articles');
        this.articles = response.data;
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    },

    // 2. PATCH Request (Updates just the status field)
    async updateStatus(id, newStatus) {
      try {
        await axios.patch(`http://localhost:3000/articles/${id}`, {
          status: newStatus
        });
        
        // Show a brief success message
        this.savedId = id;
        setTimeout(() => { this.savedId = null; }, 2000);
      } catch (error) {
        console.error("Error updating status:", error);
      }
    },

    // 3. DELETE Request
    async deleteArticle(id) {
      // Add a quick confirmation so users don't delete by accident
      if (!confirm("Are you sure you want to delete this article?")) return;

      try {
        await axios.delete(`http://localhost:3000/articles/${id}`);
        
        // Remove it from the UI immediately without needing to refresh the page
        this.articles = this.articles.filter(article => article.id !== id);
      } catch (error) {
        console.error("Error deleting article:", error);
      }
    }
  }
}
</script>

<style scoped>
.dashboard {
  max-width: 800px;
  margin: 0 auto;
  text-align: left;
}
.article-card {
  border: 1px solid #ccc;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
  background-color: #f9f9f9;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #ffcc00; /* DHL Yellow */
  padding-bottom: 10px;
  margin-bottom: 10px;
}
h3 {
  margin: 0;
  color: #333;
}
.status-control {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed #ccc;
  display: flex;
  align-items: center;
  gap: 10px;
}
select {
  padding: 5px;
  border-radius: 4px;
}
.save-indicator {
  color: green;
  font-size: 0.9em;
  font-weight: bold;
}
.delete-btn {
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
}
.delete-btn:hover {
  background-color: #c82333;
}
</style>