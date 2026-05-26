async function getRecord(){
    try{
        const incident = JSON.parse(localStorage.getItem('incidentInfo'));

        if(incident){
            return incident;
        }
        else{
            window.location.href = 'logs.html';
        }
    }

    catch(error){
        console.error(error);
        alert('Unable to retrieve full incident information.')
    }
}

async function updateRecord(id, updateData){
    try{
        const response = await fetch(`http://localhost:3000/incidents/${id}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(updateData)
        });

        if(response.ok){
            const localUpdateData = await response.json();
            localStorage.setItem('incidentInfo', JSON.stringify(localUpdateData));
            alert('Report update successful.');

            return localUpdateData;
        }

        else{
            alert('Fail to update report.');
        }
    }

    catch(error){
        console.error(error);
        alert('Unable to update the report.');
    }
}

async function deleteRecord(id){
    try{
        const response = await fetch(`http://localhost:3000/incidents/${id}`,{
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'}
        });

        if(response.ok){
            alert('Report delete successful.');
            window.location.href = 'logs.html';
        }
        else{
            alert('Fail to delete report.');
        }
    }
    catch(error){
        console.error(error);
        alert('Unable to delete the report.');
    }
}