const form = document.querySelector('form');

form.addEventListener('submit', async function(event){
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try{
        const response = await fetch('http://localhost:3000/users');
        const users = await response.json();
        const validUser = users.find(user => user.username === username && user.password === password);

        if(validUser){
            alert('Login successful.');

            localStorage.setItem('loggedInUser', JSON.stringify(validUser));
            window.location.href = 'main.html';
        }

        else{
            alert('Invalid username or password. Please try again.');
            document.getElementById('username').value = "";
            document.getElementById('password').value = "";
            return;
        }
    }

    catch(error){
        console.error(error);

        alert('Unable to connect to JSON server.');
    }
});