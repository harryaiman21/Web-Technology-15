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

async function filterRecords(filters){
    const incidents = await getRecords();

    return incidents.filter(incident => {
        const tagMatch = !filters.tag || incident.tag === filters.tag;
        const yearMatch = !filters.year || new Date(incident.date().getFullYear().toString() === filters.year);
        const creatorMatch = !filters.creator || incident.creator === filters.creator;
        const statusMatch = !filters.creator || incident.status === filters.status;

        return(tagMatch && yearMatch && creatorMatch && statusMatch);
    });
}

function attachIncidentListener(){
    const incidentInfos = document.querySelectorAll('.columnid');

    incidentInfos.forEach(incidentInfo => {
        incidentInfo.addEventListener('click', async function(){
            const incidentId = incidentInfo.textContent.trim();

            try{
                const incidents = await getRecords();
                const validIncident = incidents.find(incident => incident.id.toString() === incidentId);

                if(validIncident){
                    localStorage.setItem('incidentInfo', JSON.stringify(validIncident));
                    window.location.href = 'info.html';
                }
                else{
                    alert('Incident does not exist in database.');
                }
            }

            catch(error){
                console.error(error);
                alert('Error retrieving incident full information.');
            }
        });
    });
}