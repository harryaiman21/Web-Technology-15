async function getRecords(){
    try{
        const response = await fetch('http://localhost:3000/incidents');
        return await response.json();
    }
    catch(error){
        console.error(error);
        alert('Unable to retrieve incidents.');
    }
}

async function generateId(){
    try{
        const incidents = await getRecords();
        const usedIds = incidents.map(incident => parseInt(incident.id)).filter(id => !isNaN(id));

        usedIds.sort((a, b) => a - b);
        
        let newId = 1;
        for(let i = 0; i < usedIds.length; i++){
            if(usedIds[i] !== newId){
                break;
            }

            newId++;
        }

        return newId;
    }

    catch(error){
        console.error(error);
        alert('Unable to generate incident ID');
    }
}

async function createRecord(descriptionText){
    try{
        const user = JSON.parse(localStorage.getItem('loggedInUser'));
        const newId = await generateId();

        const newIncident = {
            id: newId,
            creator: user.username,
            date: new Date().toLocaleDateString(),
            status: 'Draft',
            description: descriptionText,
            tag: 'none',
            department: 'none',
            channel: 'none'
        };

        const response = await fetch('http://localhost:3000/incidents/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newIncident)
        });

        if(response.ok){
            alert('File upload successful.');
            console.log(newIncident);
        }
        else{
            alert('Fail to upload file.');
        }
    }

    catch(error){
        console.error(error);
        alert('Unable to create incident.');
    }
}