document.addEventListener('DOMContentLoaded', function(){
    try{
        const user = JSON.parse(localStorage.getItem('loggedInUser'));

        if(user){
            const username = user.username;
            const welcome = document.querySelector('.welcome');

            welcome.innerHTML += username;
        }
        else{
            alert('No logged in user found.');

            window.location.href = 'login.html';
        }
    }
    catch(error){
        console.error(error);

        alert('Unable to retrieve username.');
    }
});

async function getRecords(){
    try{
        const response = await fetch('http://localhost:3000/incidents');
        const incidents = await response.json();

        return incidents;
    }
    catch(error){
        console.error(error);
        alert('Unable to retrieve incidents from JSON server.');
    }
}