<template>
  <div id="app">
    <nav class="navbar">
      <h1>DHL Knowledge Base System</h1>
      <div class="links">
        <router-link to="/">Dashboard </router-link>
        <router-link to="/upload">Upload Input</router-link>
      </div>
    </nav>

    <main class="content">
      <router-view/>
    </main>
  </div>
</template>

<style>
#app {
  font-family: Arial, sans-serif;
  text-align: center;
  color: #333;
}
.navbar {
  background-color: #ffcc00; /* DHL Yellow */
  padding: 15px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.navbar h1 {
  margin: 0;
  color: #d40511; /* DHL Red */
  font-size: 24px;
}
.links a {
  margin-left: 20px;
  text-decoration: none;
  font-weight: bold;
  color: #333;
  padding: 8px 12px;
  border-radius: 4px;
}
.links a:hover, .links a.router-link-exact-active {
  background-color: #d40511;
  color: white;
}
.content {
  padding: 40px;
}
</style>